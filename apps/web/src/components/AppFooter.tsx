import { Separator } from "./ui/separator";

const repositoryUrl = "https://github.com/competitive-intel/compintel";
const isKnownCommit = __APP_GIT_COMMIT__ !== "unknown";
const commitUrl = isKnownCommit
  ? `${repositoryUrl}/commit/${__APP_GIT_COMMIT__}`
  : undefined;
const shortCommitId = isKnownCommit
  ? __APP_GIT_COMMIT__.slice(0, 7)
  : __APP_GIT_COMMIT__;

export function AppFooter() {
  return (
    <footer className="mt-auto w-full">
      <Separator />
      <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-4 text-xs text-muted-foreground sm:px-6 lg:px-8">
        <span>Competitive Intelligence</span>
        {commitUrl === undefined ? (
          <span className="font-mono text-foreground">{shortCommitId}</span>
        ) : (
          <a
            className="font-mono text-foreground transition-colors hover:text-muted-foreground"
            href={commitUrl}
            rel="noreferrer"
            target="_blank"
            title={`Git commit: ${__APP_GIT_COMMIT__}`}
          >
            {shortCommitId}
          </a>
        )}
        <a
          className="text-foreground transition-colors hover:text-muted-foreground"
          href={repositoryUrl}
          rel="noreferrer"
          target="_blank"
        >
          开源
        </a>
      </div>
    </footer>
  );
}
