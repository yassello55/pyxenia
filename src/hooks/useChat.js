import { useState, useEffect, useRef, useCallback } from 'react';

const LLM_TIMEOUT_MS = 90_000; // 90 seconds — abort if no response by then

const api = window.pyxenia;

export function useChat(chatId) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const streamingRef = useRef('');
  const timeoutRef = useRef(null);

  const clearStreamingState = useCallback((errorMsg = null) => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.streaming) return [...prev.slice(0, -1), { ...last, streaming: false, ...(errorMsg ? { error: errorMsg } : {}) }];
      return prev;
    });
    setIsStreaming(false);
    if (errorMsg) setError(errorMsg);
  }, []);

  useEffect(() => {
    if (!chatId) return;

    const unsubToken = api.onLlmToken(({ chatId: cid, text }) => {
      if (cid !== chatId) return;
      if (streamingRef.current.length === 0) console.log('[Chat] First token received');
      streamingRef.current += text;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.streaming) {
          return [...prev.slice(0, -1), { ...last, content: streamingRef.current }];
        }
        return prev;
      });
    });

    const unsubToolStart = api.onLlmToolStart(({ chatId: cid, toolName, toolInput }) => {
      if (cid !== chatId) return;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.streaming) {
          const steps = [...(last.steps || []), { tool: toolName, input: toolInput, status: 'running' }];
          return [...prev.slice(0, -1), { ...last, steps }];
        }
        return prev;
      });
    });

    const unsubToolDone = api.onLlmToolDone(({ chatId: cid, toolName, result }) => {
      if (cid !== chatId) return;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.streaming) {
          const steps = (last.steps || []).map(s =>
            s.tool === toolName && s.status === 'running'
              ? { ...s, result, status: 'done' }
              : s
          );
          return [...prev.slice(0, -1), { ...last, steps }];
        }
        return prev;
      });
    });

    const unsubDone = api.onLlmDone(({ chatId: cid }) => {
      console.log('[Chat] llm:done received, chatId match:', cid === chatId);
      if (cid !== chatId) return;
      clearStreamingState();
    });

    const unsubError = api.onLlmError(({ chatId: cid, message }) => {
      console.error('[Chat] llm:error received:', message, 'chatId match:', cid === chatId);
      if (cid !== chatId) return;
      clearStreamingState(message);
    });

    return () => {
      unsubToken(); unsubToolStart(); unsubToolDone(); unsubDone(); unsubError();
    };
  }, [chatId]);

  const sendMessage = useCallback(async (text, { provider, model, context, attachment }) => {
    if ((!text.trim() && !attachment) || isStreaming) return;
    setError(null);

    const userMsg = {
      role: 'user',
      content: text,
      id: `msg_${Date.now()}`,
      attachment: attachment || null,
    };
    const assistantMsg = { role: 'assistant', content: '', streaming: true, steps: [], id: `msg_${Date.now() + 1}` };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    streamingRef.current = '';

    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
      ...(m.attachment ? { attachment: m.attachment } : {}),
    }));

    console.log('[Chat] Sending to LLM:', { provider, model, chatId, msgCount: history.length });

    timeoutRef.current = setTimeout(() => {
      console.warn('[Chat] LLM timeout — aborting');
      api.llmAbort(chatId);
      clearStreamingState('Request timed out — please try again');
    }, LLM_TIMEOUT_MS);

    try {
      const result = await api.llmSend({ chatId, messages: history, provider, model, context });
      console.log('[Chat] llmSend result:', result);
      if (result?.error) {
        clearStreamingState(result.error);
      }
    } catch (err) {
      console.error('[Chat] llmSend threw:', err);
      clearStreamingState(err?.message || 'IPC error — try restarting the app');
    }
  }, [chatId, messages, isStreaming]);

  const abort = useCallback(async () => {
    await api.llmAbort(chatId);
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }];
      }
      return prev;
    });
    setIsStreaming(false);
  }, [chatId]);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, error, sendMessage, abort, clear };
}
