import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <Card className="w-full max-w-md mx-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            The page you're looking for doesn't exist.
          </p>

          <Link href="/">
            <Button className="mt-6 w-full" data-testid="button-home">
              Go Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
