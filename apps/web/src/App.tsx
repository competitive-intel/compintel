import { Navigate, Route, Routes } from "react-router-dom";

import { AuthLayout } from "./components/AuthLayout";
import { AppShell } from "./components/AppShell";
import { AdministratorRoute, ProtectedRoute } from "./components/RouteGuards";
import { AdminGamesPage } from "./pages/admin/AdminGamesPage";
import { AdminSystemSettingsPage } from "./pages/admin/AdminSystemSettingsPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { PendingApprovalPage } from "./pages/auth/PendingApprovalPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { GameDetailPage } from "./pages/games/GameDetailPage";
import { GameListPage } from "./pages/games/GameListPage";
import { SubmissionDetailPage } from "./pages/submissions/SubmissionDetailPage";
import { SubmissionListPage } from "./pages/submissions/SubmissionListPage";

export function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="pending" element={<PendingApprovalPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to="/games" />} />
          <Route path="games" element={<GameListPage />} />
          <Route path="games/:gameSlug" element={<GameDetailPage />} />
          <Route
            path="games/:gameSlug/submissions"
            element={<SubmissionListPage />}
          />
          <Route
            path="submissions/:submissionId"
            element={<SubmissionDetailPage />}
          />
          <Route element={<AdministratorRoute />}>
            <Route path="admin/users" element={<AdminUsersPage />} />
            <Route path="admin/games" element={<AdminGamesPage />} />
            <Route
              path="admin/settings"
              element={<AdminSystemSettingsPage />}
            />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
