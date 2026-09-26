const AdminPageHeader = ({ title, description, actions }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="space-y-1">
      <h1 className="font-heading text-2xl font-semibold sm:text-3xl">{title}</h1>
      {description && (
        <p className="text-sm text-muted-foreground sm:text-base">
          {description}
        </p>
      )}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
  </div>
);

export default AdminPageHeader;
