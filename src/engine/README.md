# Form engine

This folder is reserved for the Milestone 2 read engine and the Milestone 3 fill engine.

The open chart is the in-memory `SelectedPatient` in `src/ui/selected-patient.ts`. Fill and Save should read that snapshot. Milestone 1 does not inject scripts into EHR pages, does not read forms, and does not write to FLOR. The manifest already declares `scripting`, `activeTab`, and `optional_host_permissions` so later milestones can ask for a site without a new extension id.
