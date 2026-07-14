import { useEffect } from "react";

const SITE_NAME = "CompIntel";

export function usePageTitle(pageTitle: string) {
  useEffect(() => {
    document.title = `${pageTitle} | ${SITE_NAME}`;
  }, [pageTitle]);
}
