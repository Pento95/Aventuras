export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  // Reasoning/thinking output if model supports it (e.g., minimax-m2.1)
  // Only present for assistant messages
  reasoning?: string | null;
}

// Extended message type for tool calling
export interface ToolCallMessage {
  role: 'assistant';
  content: string | null;
  tool_calls: ToolCall[];
  // Reasoning/thinking output if model supports it (e.g., minimax-m2.1)
  reasoning?: string | null;
}

export interface ToolResultMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

export type AgenticMessage = Message | ToolCallMessage | ToolResultMessage;

// Tool definitions (OpenAI function calling format)
export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface Tool {
  type: 'function';
  function: ToolFunction;
}

// Tool calls from the model
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface GenerationRequest {
  messages: Message[];
  model: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stopSequences?: string[];
  extraBody?: Record<string, unknown>; // For provider-specific options like reasoning
}

// Extended request for agentic tool-calling flows
export interface AgenticRequest {
  messages: AgenticMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools: Tool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  extraBody?: Record<string, unknown>;
}

export interface GenerationResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Extended response for agentic flows
export interface AgenticResponse {
  content: string | null;
  model: string;
  tool_calls?: ToolCall[];
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningTokens?: number;
  };
  // Reasoning/thinking output if enabled
  reasoning?: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  pricing?: {
    prompt: number;
    completion: number;
  };
}

export interface AIProvider {
  id: string;
  name: string;

  generateResponse(request: GenerationRequest): Promise<GenerationResponse>;
  streamResponse(request: GenerationRequest): AsyncIterable<StreamChunk>;
  listModels(): Promise<ModelInfo[]>;
  validateApiKey(): Promise<boolean>;
}
