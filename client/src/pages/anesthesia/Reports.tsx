export default function Reports() {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-2">View and export anesthesia case reports</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-chart-line text-3xl text-primary"></i>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Reports Coming Soon</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            This section will provide comprehensive reports and analytics for your anesthesia cases.
          </p>
        </div>
      </div>
    </div>
  );
}
