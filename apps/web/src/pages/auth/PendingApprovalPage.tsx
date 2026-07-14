import { Clock3 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { usePageTitle } from "../../lib/use-page-title";

export function PendingApprovalPage() {
  usePageTitle("等待审核");
  const location = useLocation();
  const username = (location.state as { username?: string } | null)?.username;
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <Badge variant="outline">等待审核</Badge>
        <CardTitle>申请已提交</CardTitle>
      </CardHeader>
      <CardContent>
        <Alert>
          <Clock3 />
          <AlertTitle>正在等待管理员审核</AlertTitle>
          <AlertDescription>
            {username === undefined ? "你的账号" : `账号 @${username}`}，
            审核通过后即可登录平台。
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full" variant="outline">
          <Link to="/login">返回登录</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
