"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { createCategory } from "@/lib/api";
import LinkButton from "@/components/Modules/Common/LinkButton";
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
      <LinkButton
        href="/admin/categories"
        variant="ghost"
        className="gap-1.5 text-muted-foreground"
      >
        <ArrowLeft />
        Back to categories
      </LinkButton>

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