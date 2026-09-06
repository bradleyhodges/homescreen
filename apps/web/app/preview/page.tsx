import type { Metadata } from "next";
import { SampleDashboard } from "@/components/home/sample-dashboard";

export const metadata: Metadata = {
    title: "Sample home · Homescreen",
    description: "Explore a sample home with local, interactive accessories.",
};

export default function PreviewPage() {
    return <SampleDashboard />;
}
