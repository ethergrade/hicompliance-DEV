import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ANSWER_LABEL, type Answer, type Question } from "../api";

interface Props {
  questions: Question[];
  answers: Record<string, Answer>;
  onAnswer?: (questionId: string, a: Answer) => void;
  readOnly?: boolean;
}

export function AssessmentForm({ questions, answers, onAnswer, readOnly }: Props) {
  const groups = questions.reduce<Record<string, Question[]>>((acc, q) => {
    (acc[q.category_label] ||= []).push(q);
    return acc;
  }, {});
  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([cat, qs]) => (
        <div key={cat} className="space-y-3">
          <h3 className="text-sm font-semibold">{cat}</h3>
          {qs.map((q) => (
            <div key={q.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground mt-0.5">{q.order_index}.</span>
                <p className="text-sm flex-1">{q.question_text}</p>
                {q.is_critical && <Badge variant="destructive" className="shrink-0">Critica</Badge>}
              </div>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(ANSWER_LABEL) as Answer[]).map((a) => (
                  <Button key={a} type="button" size="sm" disabled={readOnly}
                    variant={answers[q.id] === a ? "default" : "outline"} onClick={() => onAnswer?.(q.id, a)}>
                    {ANSWER_LABEL[a]}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
