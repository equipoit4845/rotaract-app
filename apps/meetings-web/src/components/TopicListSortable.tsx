"use client";

import { useState } from "react";
import { toast } from "sonner";
import { topicsApi } from "@/lib/api";
import { formatDurationMinutes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TOPIC_TYPE_LABELS } from "@/lib/meeting-constants";

type Topic = {
  id: string;
  title: string;
  description?: string | null;
  order: number;
  type: string;
  estimatedDurationSec?: number | null;
  status: string;
};

export function TopicListSortable({
  meetingId,
  topics: initialTopics,
  currentTopicId,
  canEdit,
  onTopicsChange,
  onCurrentTopicChange,
}: {
  meetingId: string;
  topics: Topic[];
  currentTopicId?: string | null;
  canEdit: boolean;
  onTopicsChange: (topics: Topic[]) => void;
  onCurrentTopicChange?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function reorder(moveIndex: number, direction: 1 | -1) {
    const newOrder = [...initialTopics].map((t) => t.id);
    const target = moveIndex + direction;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[moveIndex], newOrder[target]] = [
      newOrder[target],
      newOrder[moveIndex],
    ];
    setLoading(true);
    try {
      const list = await topicsApi.reorder(meetingId, newOrder);
      onTopicsChange(list as Topic[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function setCurrent(topicId: string | null) {
    setLoading(true);
    try {
      await topicsApi.setCurrent(meetingId, topicId);
      onCurrentTopicChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function remove(topicId: string) {
    setLoading(true);
    try {
      await topicsApi.delete(meetingId, topicId);
      onTopicsChange(initialTopics.filter((t) => t.id !== topicId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {initialTopics.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Sin temas.</p>
      ) : (
        <ul className="space-y-2 list-none p-0 m-0">
          {initialTopics.map((t, i) => (
            <li
              key={t.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors",
                currentTopicId === t.id && "bg-accent/50 border-primary/30",
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                <strong className="font-medium">{t.title}</strong>
                <Badge variant="secondary">
                  {TOPIC_TYPE_LABELS[t.type] ?? t.type}
                </Badge>
                {formatDurationMinutes(t.estimatedDurationSec) && (
                  <span className="text-muted-foreground">
                    ({formatDurationMinutes(t.estimatedDurationSec)})
                  </span>
                )}
                {currentTopicId === t.id && (
                  <Badge variant="default">Tema actual</Badge>
                )}
              </span>
              {canEdit && (
                <span className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={loading || i === 0}
                    onClick={() => reorder(i, -1)}
                    title="Subir"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={loading || i === initialTopics.length - 1}
                    onClick={() => reorder(i, 1)}
                    title="Bajar"
                  >
                    ↓
                  </Button>
                  {currentTopicId !== t.id ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => setCurrent(t.id)}
                    >
                      Tema actual
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => setCurrent(null)}
                    >
                      Quitar actual
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={loading}
                    onClick={() => remove(t.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    Eliminar
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
