import { Suspense } from "react";
import SimilaritySearchClient from "@/components/SimilaritySearchClient";

export default function SimilarityPage() {
  return (
    <main className="min-h-screen bg-bg px-4 pt-2 pb-8 text-text transition-colors md:py-8">
      <Suspense fallback={<div>Loading similarity search...</div>}>
        <SimilaritySearchClient />
      </Suspense>
    </main>
  );
}