"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { createCategory } from "@/lib/api";
import CategoryForm from "@/components/Modules/Admin/CategoryForm";

const CreateCategoryPage = () => {
  const router = useRouter();

  const handleSubmit = async (payload) => {
    await createCategory(payload);
    router.push("/admin/categories");
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <Button
        variant="ghost"
        render={<Link href="/admin/categories" />}
        className="gap-1.5 text-muted-foreground"
      >
        <ArrowLeft />
        Back to categories
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create category</CardTitle>
          <CardDescription>
            Add a new issue category so reporters can classify their reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryForm submitLabel="Create category" onSubmit={handleSubmit} />
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateCategoryPage;