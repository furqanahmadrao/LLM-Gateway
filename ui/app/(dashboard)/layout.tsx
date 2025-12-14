import React from 'react';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-background text-text-primary">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-background">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
