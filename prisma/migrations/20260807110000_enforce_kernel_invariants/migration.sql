-- The initial v1 migration already owns period, scope, transfer and open-row
-- constraints. Keep this incremental migration limited to the later-added
-- Appointment date invariant so an existing deployment is never rewritten.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_dates_valid"
  CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "startsAt" < "endsAt");
