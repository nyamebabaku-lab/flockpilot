import { Suspense } from "react";
import { AddRecord } from "@/components/add-record";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Add record" };

export default function AddPage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Add record" subtitle="Works without signal. Records send themselves when you reconnect." />
      <Suspense>
        <AddRecord />
      </Suspense>
    </div>
  );
}
