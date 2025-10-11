export default function Settings() {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Anesthesia Settings</h1>
          <p className="text-muted-foreground mt-2">Configure anesthesia module preferences</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-cog text-3xl text-primary"></i>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Settings Coming Soon</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            This section will allow you to configure default values, templates, and preferences for the anesthesia module.
          </p>
        </div>
      </div>
    </div>
  );
}
