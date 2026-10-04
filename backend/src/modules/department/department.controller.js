import asyncHandler from '../../utils/asyncHandler.js';
import * as departmentService from './department.service.js';

export const createDepartment = asyncHandler(async (req, res) => {
  const department = await departmentService.createDepartment(req.body);
  res.status(201).json({ success: true, data: department });
});

export const listDepartments = asyncHandler(async (req, res) => {
  const result = await departmentService.listDepartments(req.query);
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const getDepartment = asyncHandler(async (req, res) => {
  const department = await departmentService.getDepartment(req.params.id);
  res.json({ success: true, data: department });
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const department = await departmentService.updateDepartment(req.params.id, req.body);
  res.json({ success: true, data: department });
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  await departmentService.deleteDepartment(req.params.id);
  res.json({ success: true, message: 'Department deleted' });
});

// Stored snapshots. req.validatedQuery, not req.query: validateQuery parses into
// req.validatedQuery because Express 5 makes req.query a getter-only property.
export const listPerformance = asyncHandler(async (req, res) => {
  const query = req.validatedQuery;
  const period = await departmentService.resolvePeriod(query);

  const result = await departmentService.listPerformance({ ...query, ...period });
  const availableWindows = await departmentService.listPerformanceWindows();

  res.json({
    success: true,
    data: result.items,
    pagination: result.pagination,
    // Echoed so the UI can label the report without re-deriving "this month" itself —
    // and so a caller can see which window was actually used when it omitted the bounds.
    period,
    // The read matches one window exactly, so this is how the UI offers a way back to a
    // window that has actually been generated.
    availableWindows,
  });
});

// One department's snapshots, oldest first, for the trend view.
export const getDepartmentPerformance = asyncHandler(async (req, res) => {
  const result = await departmentService.getDepartmentTrend(
    req.params.id,
    req.validatedQuery.limit,
  );

  res.json({ success: true, data: result });
});

// Generates (or regenerates) every department's snapshot for one window. Admin-only:
// it writes the historical record that the read endpoints above serve, so a citizen
// triggering it would be editing the numbers an admin is measured by.
//
// Idempotent by construction — the upsert is keyed on
// uq_department_performance_window — so running the same window twice is a refresh, not
// a duplicate. That is what makes this safe to wire to a real scheduler later without
// changing what a caller has to do.
export const generatePerformance = asyncHandler(async (req, res) => {
  const period = await departmentService.resolvePeriod(req.body);
  departmentService.assertWindowIsSane(period);

  const snapshots = await departmentService.buildPerformanceSnapshot(period);

  res.status(201).json({
    success: true,
    data: snapshots,
    period,
    // A department with no target reports overdue_count NULL, not 0. Surfaced as an
    // explicit count so the UI can say "no target set" instead of printing a 0 that
    // reads as a perfect score for a measurement never taken.
    measured: snapshots.filter((row) => row.overdue_count !== null).length,
    unmeasured: snapshots.filter((row) => row.overdue_count === null).length,
  });
});
