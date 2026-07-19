import { LogoMark } from "@/components/icons/Logo";
import {
  GREETING_CLOSING,
  GREETING_HELP_LABEL,
  GREETING_INTRO,
  GREETING_SUBTITLE,
  GREETING_TITLE,
  GREETING_TOPICS,
} from "@/lib/constants";
import { SuggestionCards } from "./SuggestionCards";

interface WelcomeScreenProps {
  onSelectSuggestion: (prompt: string) => void;
}

export function WelcomeScreen({ onSelectSuggestion }: WelcomeScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-10 px-4 py-10 text-center">
      <div className="flex flex-col items-center gap-5">
        <LogoMark className="size-14" />
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {GREETING_TITLE}
          </h1>
          <p className="text-base font-medium text-foreground sm:text-lg">{GREETING_INTRO}</p>
          <p className="text-sm text-muted-foreground sm:text-base">{GREETING_SUBTITLE}</p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">{GREETING_HELP_LABEL}</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {GREETING_TOPICS.map((topic) => (
              <li
                key={topic}
                className="flex items-center gap-1.5 text-sm text-foreground/90"
              >
                <span className="text-primary" aria-hidden>
                  ✔
                </span>
                {topic}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm font-medium text-foreground sm:text-base">{GREETING_CLOSING}</p>
      </div>
      <SuggestionCards onSelect={onSelectSuggestion} />
    </div>
  );
}
