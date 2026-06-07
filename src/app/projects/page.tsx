"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FolderOpen, Trash2, Plus } from "lucide-react";
import { fetchProjects, createProject, deleteProject } from "@/lib/api";
import { headerPaddingLeft } from '@/hooks/usePlatform';

interface Project {
  id: string;
  name: string;
  triggerCount: number;
  updatedAt: string;
  isDemo: boolean;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = (now - then) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const data = await fetchProjects();
      const list = (data.projects ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        triggerCount: p.trigger_count ?? 0,
        updatedAt: p.updated_at,
        isDemo: (p as unknown as Record<string, boolean>).is_demo ?? false,
      }));
      setProjects(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const data = await createProject({ name: "Untitled Project" } as Parameters<typeof createProject>[0]);
      if (data.project) {
        router.push(`/?project=${data.project.id}`);
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeletingId(id);
    try {
      await deleteProject(id);
      setProjects((p) => p.filter((proj) => proj.id !== id));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-zinc-500 animate-pulse">Loading projects…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className={`flex items-center justify-between ${headerPaddingLeft()} pr-6 py-4 border-b border-zinc-800`}>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Your Projects</h1>
            <p className="text-xs text-zinc-500">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {projects.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <FolderOpen className="w-12 h-12 text-zinc-700 mx-auto" />
            <p className="text-sm text-zinc-500">No projects yet</p>
            <button
              onClick={handleCreate}
              className="text-sm text-green-400 hover:underline"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <button
                      onClick={() => router.push(`/?project=${p.id}`)}
                      className="text-left text-sm font-semibold text-white truncate hover:text-green-400 transition-colors block max-w-[200px]"
                    >
                      {p.name}
                    </button>
                  </div>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className={`text-xs px-2 py-1 rounded transition-colors shrink-0 ${
                      confirmDeleteId === p.id
                        ? "bg-red-500/20 text-red-400"
                        : "text-zinc-600 hover:text-red-400"
                    }`}
                  >
                    {confirmDeleteId === p.id
                      ? "Confirm?"
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="text-xs text-zinc-500 space-y-1">
                  <div>{p.triggerCount} trigger{p.triggerCount !== 1 ? "s" : ""}</div>
                  <div>{timeAgo(p.updatedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}