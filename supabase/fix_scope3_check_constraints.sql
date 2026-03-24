-- Fix CHECK constraints for new scale: A(1-3), B(0-2), C(0-2)
ALTER TABLE scope3_screening DROP CONSTRAINT IF EXISTS scope3_screening_score_magnitude_check;
ALTER TABLE scope3_screening DROP CONSTRAINT IF EXISTS scope3_screening_score_data_avail_check;
ALTER TABLE scope3_screening DROP CONSTRAINT IF EXISTS scope3_screening_score_relevance_check;

ALTER TABLE scope3_screening ADD CONSTRAINT scope3_screening_score_magnitude_check CHECK (score_magnitude BETWEEN 1 AND 3);
ALTER TABLE scope3_screening ADD CONSTRAINT scope3_screening_score_data_avail_check CHECK (score_data_avail BETWEEN 0 AND 2);
ALTER TABLE scope3_screening ADD CONSTRAINT scope3_screening_score_relevance_check CHECK (score_relevance BETWEEN 0 AND 2);
