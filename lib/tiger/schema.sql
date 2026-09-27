-- Tiger Data schema. Read-side analytics only; nothing here is on the
-- address -> report critical path.
--
-- Why a database at all: ZORI is a 10MB CSV and the stabilized list is 5.2MB.
-- Parsed in-process, every cold serverless instance re-downloads 15MB before it
-- can answer. That is the problem this replaces.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------------------
-- Zillow Observed Rent Index: genuine time series, one row per ZIP per month.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zori (
  zip   text    NOT NULL,
  month date    NOT NULL,
  rent  numeric NOT NULL CHECK (rent > 0)
);

SELECT create_hypertable(
  'zori', by_range('month', INTERVAL '2 years'),
  if_not_exists => TRUE
);

-- Hypertables cannot carry a plain primary key that omits the partitioning
-- column, so uniqueness is enforced on (zip, month) explicitly.
CREATE UNIQUE INDEX IF NOT EXISTS zori_zip_month_idx ON zori (zip, month DESC);

-- ---------------------------------------------------------------------------
-- Rent stabilized buildings: 49k rows, point lookups by BBL.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stabilized (
  bbl            text PRIMARY KEY,
  building_class text
);

-- ---------------------------------------------------------------------------
-- Continuous aggregate over the rent series: yearly average per ZIP.
-- A real cagg over real time-series data, refreshed by the scheduler rather
-- than recomputed per request.
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS zori_yearly
WITH (timescaledb.continuous) AS
SELECT
  zip,
  time_bucket(INTERVAL '1 year', month) AS year,
  avg(rent)  AS avg_rent,
  min(rent)  AS min_rent,
  max(rent)  AS max_rent,
  count(*)   AS months
FROM zori
GROUP BY zip, year
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'zori_yearly',
  start_offset      => INTERVAL '10 years',
  end_offset        => INTERVAL '1 month',
  schedule_interval => INTERVAL '1 day',
  if_not_exists     => TRUE
);
