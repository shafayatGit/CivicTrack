import { FolderTree, ShieldCheck } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import CategoriesTable from "@/components/Modules/Admin/CategoriesTable";

const AdminDashboard = () => {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
          Admin Dashboard
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Welcome back. Here&apos;s an overview of your portal.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardDescription>Portal</CardDescription>
            <FolderTree className="size-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-semibold">
              CivicTrack Admin
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage categories and reports.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardDescription>Access level</CardDescription>
            <ShieldCheck className="size-5 text-primary" />
          </CardHeader>
          <CardContent>
            <Badge>admin</Badge>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardDescription>Quick actions</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Use the sidebar to create and manage categories.
          </CardContent>
        </Card>
      </section>

      <CategoriesTable />
    </div>
  );
};

export default AdminDashboard;