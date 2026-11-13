import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { z } from 'zod';

/**
 * The model id the API expects. An empty setting means the default, and a name typed the way
 * people say it ("Sonnet 5", "Haiku 5.5") becomes its id ("claude-sonnet-5", "claude-haiku-5-5").
 */
export function modelId(setting?: string): string {
  const name = (setting ?? '').trim().toLowerCase();
  if (!name) return 'claude-opus-5-5';
  const id = name.replace(/[\s.]+/g, '-');
  return id.startsWith('claude-') ? id : `claude-${id}`;
}

/** The one place the app talks to Claude. Everything else asks through `ask`. */
@Injectable()
export class AiService {
  private client?: Anthropic;

  constructor(private readonly config: ConfigService) {}

  /** False until ANTHROPIC_API_KEY is in .env; callers that can work without AI check this first. */
  get enabled(): boolean {
    return Boolean(this.config.get<string>('ANTHROPIC_API_KEY'));
  }

  /** Fails fast, before any slow work, when a feature cannot run without AI. */
  requireEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'AI is switched off: add ANTHROPIC_API_KEY to .env',
      );
    }
  }

  /** One question in, one answer out, in the shape of `schema`. */
  async ask<T>(system: string, user: string, schema: z.ZodType<T>): Promise<T> {
    this.requireEnabled();
    this.client ??= new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
    const response = await this.client.messages.parse({
      model: modelId(this.config.get<string>('AI_MODEL')),
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: zodOutputFormat(schema) },
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new ServiceUnavailableException(
        `Claude gave no usable answer (${response.stop_reason})`,
      );
    }
    return response.parsed_output;
  }
}
