/// <reference types="vitest/config" />

import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { simpleGit } from "simple-git";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

async function resolveGitCommit(): Promise<string> {
  try {
    const gitCommit = (
      await simpleGit({ baseDir: repositoryRoot }).revparse(["HEAD"])
    ).trim();

    if (/^[0-9a-f]{40}$/i.test(gitCommit)) {
      return gitCommit;
    }
  } catch {
    // Release images may be built without the repository's Git metadata.
  }

  const environmentCommit =
    process.env.COMPINTEL_GIT_COMMIT ??
    process.env.GITHUB_SHA ??
    process.env.CI_COMMIT_SHA;

  if (
    environmentCommit !== undefined &&
    /^[0-9a-f]{7,64}$/i.test(environmentCommit.trim())
  ) {
    return environmentCommit.trim().toLowerCase();
  }

  return "unknown";
}

export default defineConfig(async () => {
  const gitCommit = await resolveGitCommit();

  return {
    define: {
      __APP_GIT_COMMIT__: JSON.stringify(gitCommit),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ""),
        },
      },
    },
    preview: {
      port: 4173,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
