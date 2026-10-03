import { Check } from "lucide-react";
import { cn } from "cn";

export interface StepperStep {
  key: string;
  label: string;
}

// Stateless display primitive — no step/multi-step wizard existed
// anywhere in this codebase before this one. All step state lives in the
// parent via useState, matching this repo's hand-rolled (no
// react-hook-form) form convention.
export function Stepper({
  steps,
  currentStepIndex,
  onStepClick,
}: {
  steps: StepperStep[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
}) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((step, index) => {
        const isComplete = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;
        // Only allow jumping back to an already-completed step, never ahead.
        const clickable = Boolean(onStepClick) && index <= currentStepIndex;

        return (
          <li key={step.key} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(index)}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                isCurrent && "border-primary bg-primary text-primary-foreground",
                isComplete && !isCurrent && "border-primary bg-primary/10 text-primary",
                !isCurrent && !isComplete && "border-border text-muted-foreground",
                clickable && "cursor-pointer",
              )}
            >
              {isComplete ? <Check className="size-3.5" /> : index + 1}
            </button>
            <span className={cn("hidden text-sm sm:inline", isCurrent ? "font-medium text-foreground" : "text-muted-foreground")}>{step.label}</span>
            {index < steps.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
