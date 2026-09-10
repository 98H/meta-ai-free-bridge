export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export function formatToolsPrompt(tools: any[]): string {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return '';

  const toolDefs = tools.map((t: any) => {
    const fn = t.function || t;
    return {
      name: fn.name,
      description: fn.description || '',
      parameters: fn.parameters || {}
    };
  });

  return `\n\n# Tools

You have access to the following tools:

<tools>
${JSON.stringify(toolDefs, null, 2)}
</tools>

# Tool Calling Instructions
- When you take an action or call a tool, you MUST emit a tool call block using the exact syntax:
<tool_call>
{"name": "tool_name", "arguments": {"arg": "val"}}
</tool_call>
- Never claim you cannot use a tool that is defined in <tools>. Simply emit the <tool_call> block.
- Any explanation must be placed outside the <tool_call> tags.
- If no tool is needed, respond normally without <tool_call>.\n`;
}

export function formatMessagesWithTools(messages: any[], tools: any[], maxChars = 18000): string {
  let systemPrompt = '';
  const turns: string[] = [];

  for (const m of messages) {
    const role = (m.role || 'user').toUpperCase();
    let text = typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content) : '');

    // If assistant message called tools in history
    if (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const callsStr = m.tool_calls.map((tc: any) => {
        const fn = tc.function || {};
        let args = fn.arguments;
        try { if (typeof args === 'string') args = JSON.parse(args); } catch {}
        return `<tool_call>\n${JSON.stringify({ name: fn.name, arguments: args }, null, 2)}\n</tool_call>`;
      }).join('\n');
      text = text ? `${text}\n${callsStr}` : callsStr;
    }

    // If message is a tool execution output
    if (role === 'TOOL') {
      text = `Tool Output (${m.tool_call_id || m.name || 'call'}):\n${text}`;
    }

    if (m.role === 'system' && !systemPrompt) {
      systemPrompt = `System: ${text}\n\n`;
    } else {
      turns.push(`${role}: ${text}`);
    }
  }

  // Inject tools contract
  const toolsContract = formatToolsPrompt(tools);
  if (toolsContract) {
    systemPrompt = systemPrompt ? `${systemPrompt}${toolsContract}\n\n` : `System: ${toolsContract}\n\n`;
  }

  let totalChars = systemPrompt.length;
  const keptTurns: string[] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (totalChars + t.length <= maxChars || keptTurns.length === 0) {
      keptTurns.unshift(t);
      totalChars += t.length;
    } else {
      break;
    }
  }

  return (systemPrompt + keptTurns.join('\n\n')).trim();
}

export function parseToolCalls(text: string): { content: string | null; tool_calls: ToolCall[] } {
  if (!text) return { content: null, tool_calls: [] };

  const toolCalls: ToolCall[] = [];
  const regex = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/gi;
  let cleanedText = text;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawJson = match[1].trim();
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && parsed.name) {
        const args = typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments || {});
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 11)}`,
          type: 'function',
          function: {
            name: parsed.name,
            arguments: args
          }
        });
      }
    } catch {}
  }

  cleanedText = cleanedText.replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi, '').trim();
  return { content: cleanedText || null, tool_calls: toolCalls };
}
