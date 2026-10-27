-- Read & Check scores. One row per day + seat + card; the best reading wins (see worker/index.mjs).
CREATE TABLE IF NOT EXISTS scores (
  day          TEXT    NOT NULL,             -- YYYY-MM-DD, Taipei time, set by the Worker
  seat         INTEGER NOT NULL,             -- seat number 1-40 (no names)
  card         TEXT    NOT NULL,             -- '1','2','3','4-1','4-2','5','6'
  grp          INTEGER NOT NULL,             -- group 1-6 (latest upload)
  stars        INTEGER NOT NULL,             -- 0-3
  overall      INTEGER NOT NULL,             -- Azure PronScore 0-100
  accuracy     INTEGER,
  fluency      INTEGER,
  completeness INTEGER,
  prosody      INTEGER,
  weak         TEXT    NOT NULL DEFAULT '[]', -- JSON array of words to practice
  attempts     INTEGER NOT NULL DEFAULT 1,
  updated_at   INTEGER NOT NULL,             -- epoch ms
  PRIMARY KEY (day, seat, card)
);
