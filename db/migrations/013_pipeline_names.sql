-- Migration 013: Extend pipeline_runs allowed pipeline names
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pr_pipeline_check;

ALTER TABLE pipeline_runs
  ADD CONSTRAINT pr_pipeline_check
  CHECK (pipeline IN (
    'superinvestor', '1pc-club', 'pms', 'altfunds', 'sast-sweep',
    'mf-holdings', 'nav-daily', 'ipo-sync', 'ipo-subscription',
    'ipo-performance', 'quarterly-si', 'ipo-gmp', 'daily-nav-ipo'
  ));
