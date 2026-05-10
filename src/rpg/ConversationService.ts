import { CONVERSATION_POOL } from "./conversation-pool";
import type { ConversationContext, ConversationTrigger } from "./conversation-pool";

export type { ConversationContext, ConversationTrigger };

/** Minimal bot info needed for conversation eligibility checks. */
export interface CommsBot {
  readonly id: string;
  readonly name: string;
  readonly personalityType: string;
  readonly adoptionLean: number;
  readonly traitIds: readonly string[];
  readonly isAlive: boolean;
}

export interface CommsTriggerResult {
  readonly botName: string;
  readonly personalityType: string;
  readonly line: string;
}

const AMBIENT_MIN_MS = 90_000;
const AMBIENT_MAX_MS = 240_000;
const EVENT_COOLDOWN_MS = 15_000;  // per-bot per-trigger cooldown for event triggers
const AMBIENT_COOLDOWN_MS = 60_000; // per-bot cooldown for ambient so the same bot doesn't spam

export class ConversationService {
  private readonly cooldowns = new Map<string, number>(); // `${botId}:${trigger}` → remaining ms
  private lastContext: ConversationContext = "calm";
  private ambientTimerMs = 0;
  private nextAmbientMs: number = this.randomInterval();

  tick(deltaMs: number, bots: readonly CommsBot[], context: ConversationContext): CommsTriggerResult | null {
    // Tick all per-bot cooldowns
    for (const [key, cd] of this.cooldowns) {
      const next = cd - deltaMs;
      if (next <= 0) this.cooldowns.delete(key);
      else this.cooldowns.set(key, next);
    }

    // Context change resets ambient timer so we don't immediately talk in a new situation
    if (context !== this.lastContext) {
      this.lastContext = context;
      this.ambientTimerMs = 0;
      this.nextAmbientMs = this.randomInterval();
    }

    this.ambientTimerMs += deltaMs;
    if (this.ambientTimerMs >= this.nextAmbientMs) {
      this.ambientTimerMs = 0;
      this.nextAmbientMs = this.randomInterval();
      return this.fire("ambient", context, bots);
    }

    return null;
  }

  fireTrigger(
    trigger: ConversationTrigger,
    context: ConversationContext,
    bots: readonly CommsBot[],
  ): CommsTriggerResult | null {
    return this.fire(trigger, context, bots);
  }

  private fire(
    trigger: ConversationTrigger,
    context: ConversationContext,
    bots: readonly CommsBot[],
  ): CommsTriggerResult | null {
    const living = bots.filter(b => b.isAlive);
    if (living.length === 0) return null;

    // Gather all matching entry+bot combinations
    const candidates: Array<{ bot: CommsBot; lines: readonly string[] }> = [];

    for (const entry of CONVERSATION_POOL) {
      if (entry.trigger !== trigger) continue;
      if (entry.context !== "any" && entry.context !== context) continue;

      for (const bot of living) {
        const cdKey = `${bot.id}:${trigger}`;
        if (this.cooldowns.has(cdKey)) continue;

        if (entry.personalityTypes && !entry.personalityTypes.includes(bot.personalityType as never)) continue;
        if (entry.requiresTraits && entry.requiresTraits.length > 0) {
          const hasAll = entry.requiresTraits.every(tid => bot.traitIds.includes(tid));
          if (!hasAll) continue;
        }
        if (entry.leanRange) {
          const [lo, hi] = entry.leanRange;
          if (bot.adoptionLean < lo || bot.adoptionLean > hi) continue;
        }

        candidates.push({ bot, lines: entry.lines });
      }
    }

    if (candidates.length === 0) return null;

    const chosen = candidates[Math.floor(Math.random() * candidates.length)]!;
    const line = chosen.lines[Math.floor(Math.random() * chosen.lines.length)]!;

    // Set cooldowns
    const cdMs = trigger === "ambient" ? AMBIENT_COOLDOWN_MS : EVENT_COOLDOWN_MS;
    this.cooldowns.set(`${chosen.bot.id}:${trigger}`, cdMs);

    return { botName: chosen.bot.name, personalityType: chosen.bot.personalityType, line };
  }

  private randomInterval(): number {
    return AMBIENT_MIN_MS + Math.random() * (AMBIENT_MAX_MS - AMBIENT_MIN_MS);
  }
}
