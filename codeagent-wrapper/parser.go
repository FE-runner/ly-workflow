package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// JSONEvent represents a Codex JSON output event
type JSONEvent struct {
	Type     string     `json:"type"`
	ThreadID string     `json:"thread_id,omitempty"`
	Item     *EventItem `json:"item,omitempty"`
}

// EventItem represents the item field in a JSON event
type EventItem struct {
	Type string      `json:"type"`
	Text interface{} `json:"text"`
}

// ClaudeEvent for Claude stream-json format
type ClaudeEvent struct {
	Type      string `json:"type"`
	Subtype   string `json:"subtype,omitempty"`
	SessionID string `json:"session_id,omitempty"`
	Result    string `json:"result,omitempty"`
}

func parseJSONStream(r io.Reader) (message, threadID string) {
	return parseJSONStreamWithLog(r, logWarn, logInfo)
}

func parseJSONStreamWithWarn(r io.Reader, warnFn func(string)) (message, threadID string) {
	return parseJSONStreamWithLog(r, warnFn, logInfo)
}

func parseJSONStreamWithLog(r io.Reader, warnFn func(string), infoFn func(string)) (message, threadID string) {
	return parseJSONStreamInternal(r, warnFn, infoFn, nil, nil)
}

const (
	jsonLineReaderSize   = 64 * 1024
	jsonLineMaxBytes     = 10 * 1024 * 1024
	jsonLinePreviewBytes = 256
)

type codexHeader struct {
	Type     string `json:"type"`
	ThreadID string `json:"thread_id,omitempty"`
	Item     *struct {
		Type string `json:"type"`
	} `json:"item,omitempty"`
}

// UnifiedEvent combines all backend event formats into a single structure
// to avoid multiple JSON unmarshal operations per event
type UnifiedEvent struct {
	// Common fields
	Type string `json:"type"`

	// Codex-specific fields
	ThreadID string          `json:"thread_id,omitempty"`
	Item     json.RawMessage `json:"item,omitempty"` // Lazy parse

	// Claude-specific fields
	Subtype   string `json:"subtype,omitempty"`
	SessionID string `json:"session_id,omitempty"`
	Result    string `json:"result,omitempty"`
}

// GetSessionID returns the session ID.
func (e *UnifiedEvent) GetSessionID() string {
	return e.SessionID
}

// ItemContent represents the parsed item.text field for Codex events
type ItemContent struct {
	Type string      `json:"type"`
	Text interface{} `json:"text"`
}

// parseJSONStreamInternalWithContent3 is parseJSONStreamInternalWithContent
// plus returning the raw joined plain-text blob (before JSON fallback), so the
// executor can re-extract structured fields from multi-line JSON CLIs like
// openclaw --json that don't stream per-line events.
func parseJSONStreamInternalWithContent3(r io.Reader, warnFn func(string), infoFn func(string), onMessage func(), onComplete func(), onContent func(content, contentType string), onProgress func(line string), onSessionStarted func(id string)) (message, threadID, blob string) {
	// Wrap the reader so bytes flow through both the base parser (streaming
	// callbacks) and a tee that accumulates all plain-text lines for blob
	// extraction. The base parser already consumes the stream; tee both before
	// it so blob capture is independent of parser internals.
	var blobBuf strings.Builder
	tee := io.TeeReader(r, &blobCapture{write: &blobBuf})
	msg, tid := parseJSONStreamInternalWithContent(tee, warnFn, infoFn, onMessage, onComplete, onContent, onProgress, onSessionStarted)
	return msg, tid, blobBuf.String()
}

// blobCapture is a writer that only keeps lines that fail line-parse as JSON,
// approximating "plain text" for openclaw-style multi-line JSON blobs.
type blobCapture struct{ write *strings.Builder }

func (b *blobCapture) Write(p []byte) (int, error) {
	_, _ = b.write.Write(p)
	return len(p), nil
}

// scanPlainTextBlob drains a reader collecting non-JSON lines (used by
// parseJSONStreamInternalWithContent3 to surface openclaw indented JSON blob).
func scanPlainTextBlob(r io.Reader) string {
	reader := bufio.NewReaderSize(r, jsonLineReaderSize)
	var lines []string
	for {
		line, _, err := readLineWithLimit(reader, jsonLineMaxBytes, jsonLinePreviewBytes)
		if err != nil {
			break
		}
		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}
		var ev UnifiedEvent
		if err := json.Unmarshal(line, &ev); err != nil || len(ev.Item) == 0 && ev.Type == "" {
			// non-JSON (or indistinguishable) → plain line
			lines = append(lines, string(line))
		}
	}
	return strings.Join(lines, "\n")
}

func extractOpenClawPayload(blob string) string {
	// Find the outermost JSON object spanning the blob and pull payloads[*].text
	var obj struct {
		Payloads []struct {
			Text string `json:"text"`
		} `json:"payloads"`
	}
	if err := json.Unmarshal([]byte(blob), &obj); err != nil {
		return ""
	}
	var texts []string
	for _, p := range obj.Payloads {
		if p.Text != "" {
			texts = append(texts, p.Text)
		}
	}
	return strings.Join(texts, "\n")
}

func extractOpenClawSession(blob string) string {
	var obj struct {
		Meta struct {
			AgentMeta struct {
				SessionID string `json:"sessionId"`
			} `json:"agentMeta"`
		} `json:"meta"`
	}
	if err := json.Unmarshal([]byte(blob), &obj); err != nil {
		return ""
	}
	return obj.Meta.AgentMeta.SessionID
}

// plainTextJSON reports whether the blob contains both a payloads text and a
// session id (openclaw-style) so executor extraction is exercised only when
// relevant.
func plainTextJSON(blob string) []string {
	var obj struct {
		Payloads []struct {
			Text string `json:"text"`
		} `json:"payloads"`
	}
	if err := json.Unmarshal([]byte(blob), &obj); err != nil {
		return nil
	}
	var texts []string
	for _, p := range obj.Payloads {
		if p.Text != "" {
			texts = append(texts, p.Text)
		}
	}
	return texts
}

func parseJSONStreamInternal(r io.Reader, warnFn func(string), infoFn func(string), onMessage func(), onComplete func()) (message, threadID string) {
	return parseJSONStreamInternalWithContent(r, warnFn, infoFn, onMessage, onComplete, nil, nil, nil)
}

func parseJSONStreamInternalWithContent(r io.Reader, warnFn func(string), infoFn func(string), onMessage func(), onComplete func(), onContent func(content, contentType string), onProgress func(line string), onSessionStarted func(id string)) (message, threadID string) {
	reader := bufio.NewReaderSize(r, jsonLineReaderSize)

	if warnFn == nil {
		warnFn = func(string) {}
	}
	if infoFn == nil {
		infoFn = func(string) {}
	}

	notifyMessage := func() {
		if onMessage != nil {
			onMessage()
		}
	}

	notifyComplete := func() {
		if onComplete != nil {
			onComplete()
		}
	}

	emitProgress := func(line string) {
		if onProgress == nil || strings.TrimSpace(line) == "" {
			return
		}
		onProgress("[PROGRESS] " + line)
	}

	totalEvents := 0

	var (
		codexMessage  string
		claudeMessage string
		plainText     []string
	)

	for {
		line, tooLong, err := readLineWithLimit(reader, jsonLineMaxBytes, jsonLinePreviewBytes)
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			warnFn("Read stdout error: " + err.Error())
			break
		}

		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}
		totalEvents++

		if tooLong {
			warnFn(fmt.Sprintf("Skipped overlong JSON line (> %d bytes): %s", jsonLineMaxBytes, truncateBytes(line, 100)))
			continue
		}

		// Single unmarshal for all backend types
		var event UnifiedEvent
		if jsonErr := json.Unmarshal(line, &event); jsonErr != nil {
			// Plain-text capture: non-JSON lines (external CLIs like hermes -z)
			// never unmarshal into UnifiedEvent. Collect them here; they are
			// only used if no JSON event eventually produces a message.
			lineStr := string(line)
			if strings.TrimSpace(lineStr) != "" {
				plainText = append(plainText, lineStr)
			}
			continue
		}

		// Detect backend type by field presence
		isCodex := event.ThreadID != "" || event.Type == "turn.completed" || event.Type == "turn.started"
		if !isCodex && len(event.Item) > 0 {
			var itemHeader struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(event.Item, &itemHeader) == nil && itemHeader.Type != "" {
				isCodex = true
			}
		}
		// {"type":"item.completed","item":null} has no item type but is a real
		// codex event line; treat any explicit non-empty type as codex so it is
		// recognised (and its null item skipped) instead of reaching plain text.
		if !isCodex && event.Type != "" && event.Type != "result" {
			isCodex = true
		}
		isClaude := event.Subtype != "" || event.Result != ""
		if !isClaude && event.Type == "result" && event.GetSessionID() != "" {
			isClaude = true
		}

		// A valid JSON line that matched no backend and is otherwise empty
		// (e.g. {"item":null} or {}) is not meaningful output — skip it rather
		// than capturing it as plain text. Claude events with non-empty
		// subtype/result/session are real and already handled above.
		if !isCodex && !isClaude && event.Type == "" && event.ThreadID == "" &&
			event.Subtype == "" && event.SessionID == "" && event.Result == "" &&
			len(event.Item) == 0 {
			continue
		}

		// Extract session_id early (works for all backends); kept after backend
		// detection so plain-text-only JSON ({} with no known fields) is skipped.
		if event.GetSessionID() != "" && threadID == "" {
			threadID = event.GetSessionID()
			if onSessionStarted != nil {
				onSessionStarted(threadID)
			}
		}

		// Handle Codex events
		if isCodex {
			var details []string
			if event.ThreadID != "" {
				details = append(details, fmt.Sprintf("thread_id=%s", event.ThreadID))
			}

			if len(details) > 0 {
				infoFn(fmt.Sprintf("Parsed event #%d type=%s (%s)", totalEvents, event.Type, strings.Join(details, ", ")))
			} else {
				infoFn(fmt.Sprintf("Parsed event #%d type=%s", totalEvents, event.Type))
			}

			switch event.Type {
			case "thread.started":
				threadID = event.ThreadID
				infoFn(fmt.Sprintf("thread.started event thread_id=%s", threadID))
				emitProgress(formatProgressLine("session_started", map[string]string{"id": threadID}))
				if onSessionStarted != nil {
					onSessionStarted(threadID)
				}

			case "turn.started":
				emitProgress(formatProgressLine("turn_started", nil))

			case "thread.completed", "turn.completed":
				if event.ThreadID != "" && threadID == "" {
					threadID = event.ThreadID
				}
				infoFn(fmt.Sprintf("%s event thread_id=%s", event.Type, event.ThreadID))
				eventName := "turn_completed"
				if event.Type == "thread.completed" {
					eventName = "session_completed"
				}
				emitProgress(formatProgressLine(eventName, map[string]string{"total_events": strconv.Itoa(totalEvents)}))
				notifyComplete()

			case "item.completed":
				var itemType string
				if len(event.Item) > 0 {
					var itemHeader struct {
						Type string `json:"type"`
					}
					if err := json.Unmarshal(event.Item, &itemHeader); err == nil {
						itemType = itemHeader.Type
					}
				}

				switch itemType {
				case "agent_message", "reasoning":
					// Parse text content
					var item ItemContent
					if err := json.Unmarshal(event.Item, &item); err == nil {
						normalized := normalizeText(item.Text)
						infoFn(fmt.Sprintf("item.completed event item_type=%s message_len=%d", itemType, len(normalized)))
						if normalized != "" {
							if itemType == "agent_message" {
								codexMessage = normalized
								notifyMessage()
								emitProgress(formatProgressLine("message", map[string]string{"text": strconv.Quote(safeProgressSnippet(normalized, 120))}))
							} else {
								emitProgress(formatProgressLine("reasoning", map[string]string{"text": strconv.Quote(safeProgressSnippet(normalized, 120))}))
							}
							// Send content (Codex outputs complete blocks, not streaming deltas)
							if onContent != nil {
								onContent(normalized, itemType)
							}
						}
					} else {
						warnFn(fmt.Sprintf("Failed to parse item content: %s", err.Error()))
					}

				case "command_execution":
					// Parse command execution
					var cmdItem struct {
						Command          string `json:"command"`
						AggregatedOutput string `json:"aggregated_output"`
						ExitCode         *int   `json:"exit_code"`
						Status           string `json:"status"`
					}
					if err := json.Unmarshal(event.Item, &cmdItem); err == nil {
						// Format command execution info
						var content strings.Builder
						content.WriteString(fmt.Sprintf("$ %s\n", cmdItem.Command))
						if cmdItem.AggregatedOutput != "" {
							content.WriteString(cmdItem.AggregatedOutput)
						}
						infoFn(fmt.Sprintf("item.completed event item_type=command_execution cmd=%s exit=%v", cmdItem.Command, cmdItem.ExitCode))
						fields := map[string]string{"cmd": strconv.Quote(safeProgressSnippet(cmdItem.Command, 120))}
						if cmdItem.ExitCode != nil {
							fields["exit"] = strconv.Itoa(*cmdItem.ExitCode)
						}
						emitProgress(formatProgressLine("cmd_done", fields))
						if onContent != nil && content.Len() > 0 {
							onContent(content.String(), "command")
						}
					}

				default:
					infoFn(fmt.Sprintf("item.completed event item_type=%s", itemType))
					if itemType == "mcp_tool_call" {
						emitProgress(formatProgressLine("mcp_call", nil))
					}
				}
			}
			continue
		}

		// Handle Claude events
		if isClaude {
			if event.GetSessionID() != "" && threadID == "" {
				threadID = event.GetSessionID()
			}

			infoFn(fmt.Sprintf("Parsed Claude event #%d type=%s subtype=%s result_len=%d", totalEvents, event.Type, event.Subtype, len(event.Result)))

			if event.Result != "" {
				claudeMessage = event.Result
				notifyMessage()
				// Stream content to callback
				if onContent != nil {
					onContent(event.Result, "message")
				}
			}

			if event.Type == "result" {
				notifyComplete()
			}
			continue
		}

		// Unknown event format from other backends (turn.started/assistant/user);
		// fall through to plain-text capture so external CLIs (e.g. hermes -z)
		// that emit raw stdout aren't silently dropped.
		if len(line) > 0 {
			plainText = append(plainText, string(line))
		}
	}

	// Plain-text capture from backends without JSON events (e.g. hermes -z):
	// collect non-empty, non-JSON stdout lines. JSON lines that unmarshalled
	// into an already-handled backend above are NOT included here.
	// Only used if no JSON event produced a message.
	if claudeMessage == "" && codexMessage == "" && len(plainText) > 0 {
		joined := strings.Join(plainText, "\n")
		message = joined
		if onContent != nil {
			onContent(joined, "message")
		}
		// Plain text has no structured "result" event: notify complete so the
		// executor's post-message timer fires promptly instead of hanging on
		// the streaming backend (which would leave cmd.Wait blocked).
		if onComplete != nil {
			notifyComplete()
		}
		// plain text is the final message; no further backend events will arrive.
		notifyMessage()
	}

	switch {
	case claudeMessage != "":
		message = claudeMessage
	case codexMessage != "":
		message = codexMessage
	case len(plainText) > 0:
		message = strings.Join(plainText, "\n")
	}

	infoFn(fmt.Sprintf("parseJSONStream completed: events=%d, message_len=%d, thread_id_found=%t", totalEvents, len(message), threadID != ""))
	return message, threadID
}

func formatProgressLine(event string, fields map[string]string) string {
	parts := []string{event}
	if fields == nil {
		return strings.Join(parts, " ")
	}
	for _, key := range []string{"id", "text", "cmd", "exit", "total_events"} {
		if value, ok := fields[key]; ok && strings.TrimSpace(value) != "" {
			parts = append(parts, key+"="+value)
		}
	}
	return strings.Join(parts, " ")
}

func safeProgressSnippet(s string, maxLen int) string {
	s = strings.TrimSpace(strings.ReplaceAll(s, "\n", " "))
	s = strings.Join(strings.Fields(s), " ")
	runes := []rune(s)
	if maxLen <= 0 || len(runes) <= maxLen {
		return s
	}
	if maxLen <= 3 {
		return string(runes[:maxLen])
	}
	return string(runes[:maxLen-3]) + "..."
}

func hasKey(m map[string]json.RawMessage, key string) bool {
	_, ok := m[key]
	return ok
}

func discardInvalidJSON(decoder *json.Decoder, reader *bufio.Reader) (*bufio.Reader, error) {
	var buffered bytes.Buffer

	if decoder != nil {
		if buf := decoder.Buffered(); buf != nil {
			_, _ = buffered.ReadFrom(buf)
		}
	}

	line, err := reader.ReadBytes('\n')
	buffered.Write(line)

	data := buffered.Bytes()
	newline := bytes.IndexByte(data, '\n')
	if newline == -1 {
		return reader, err
	}

	remaining := data[newline+1:]
	if len(remaining) == 0 {
		return reader, err
	}

	return bufio.NewReader(io.MultiReader(bytes.NewReader(remaining), reader)), err
}

func readLineWithLimit(r *bufio.Reader, maxBytes int, previewBytes int) (line []byte, tooLong bool, err error) {
	if r == nil {
		return nil, false, errors.New("reader is nil")
	}
	if maxBytes <= 0 {
		return nil, false, errors.New("maxBytes must be > 0")
	}
	if previewBytes < 0 {
		previewBytes = 0
	}

	part, isPrefix, err := r.ReadLine()
	if err != nil {
		return nil, false, err
	}

	if !isPrefix {
		if len(part) > maxBytes {
			return part[:min(len(part), previewBytes)], true, nil
		}
		return part, false, nil
	}

	preview := make([]byte, 0, min(previewBytes, len(part)))
	if previewBytes > 0 {
		preview = append(preview, part[:min(previewBytes, len(part))]...)
	}

	buf := make([]byte, 0, min(maxBytes, len(part)*2))
	total := 0
	if len(part) > maxBytes {
		tooLong = true
	} else {
		buf = append(buf, part...)
		total = len(part)
	}

	for isPrefix {
		part, isPrefix, err = r.ReadLine()
		if err != nil {
			return nil, tooLong, err
		}

		if previewBytes > 0 && len(preview) < previewBytes {
			preview = append(preview, part[:min(previewBytes-len(preview), len(part))]...)
		}

		if !tooLong {
			if total+len(part) > maxBytes {
				tooLong = true
				continue
			}
			buf = append(buf, part...)
			total += len(part)
		}
	}

	if tooLong {
		return preview, true, nil
	}
	return buf, false, nil
}

func truncateBytes(b []byte, maxLen int) string {
	if len(b) <= maxLen {
		return string(b)
	}
	if maxLen < 0 {
		return ""
	}
	return string(b[:maxLen]) + "..."
}

func normalizeText(text interface{}) string {
	switch v := text.(type) {
	case string:
		return v
	case []interface{}:
		var sb strings.Builder
		for _, item := range v {
			if s, ok := item.(string); ok {
				sb.WriteString(s)
			}
		}
		return sb.String()
	default:
		return ""
	}
}
