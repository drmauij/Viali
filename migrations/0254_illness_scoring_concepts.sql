-- 0254_illness_scoring_concepts.sql
-- Backfill scoring_concept tags on hospital_anesthesia_settings.illness_lists JSONB
-- so existing clinics' default-seed illness items feed Caprini/STOP-BANG/RCRI/Apfel
-- without requiring the admin to confirm each one.
--
-- Idempotent: only sets scoring_concept when the array element matches a known
-- default seed id AND does not already have a scoring_concept. Safe to re-run.

DO $$
DECLARE
  rec RECORD;
  cats TEXT[] := ARRAY['cardiovascular','pulmonary','metabolic','neurological','coagulation','infectious','woman','kidney','ponvTransfusion','anesthesiaHistory'];
  cat TEXT;
  items JSONB;
  new_items JSONB;
  item JSONB;
  item_id TEXT;
  concept TEXT;
  updated_lists JSONB;
BEGIN
  FOR rec IN SELECT id, illness_lists FROM hospital_anesthesia_settings WHERE illness_lists IS NOT NULL
  LOOP
    updated_lists := rec.illness_lists;

    FOREACH cat IN ARRAY cats
    LOOP
      items := updated_lists -> cat;
      IF items IS NULL OR jsonb_typeof(items) <> 'array' THEN
        CONTINUE;
      END IF;

      new_items := '[]'::jsonb;
      FOR item IN SELECT * FROM jsonb_array_elements(items)
      LOOP
        item_id := item ->> 'id';
        concept := NULL;

        -- Map known default-seed ids → concept
        CASE
          -- cardiovascular
          WHEN item_id = 'htn' THEN concept := 'HYPERTENSION';
          WHEN item_id = 'chd' THEN concept := 'CAD';
          WHEN item_id = 'cad' THEN concept := 'CAD';
          WHEN item_id = 'heartFailure' THEN concept := 'CHF';
          WHEN item_id = 'chf' THEN concept := 'CHF';
          WHEN item_id = 'hypertension' THEN concept := 'HYPERTENSION';

          -- pulmonary
          WHEN item_id = 'copd' THEN concept := 'COPD';

          -- metabolic
          WHEN item_id = 'diabetesInsulin' THEN concept := 'INSULIN_DIABETES';

          -- neurological
          WHEN item_id = 'stroke' THEN concept := 'STROKE_HISTORY';
          WHEN item_id = 'recentStroke' THEN concept := 'RECENT_STROKE_30D';
          WHEN item_id = 'spinalCordInjury' THEN concept := 'SPINAL_CORD_INJURY';

          -- coagulation
          WHEN item_id = 'vte' THEN concept := 'VTE_HISTORY';
          WHEN item_id = 'dvt' THEN concept := 'VTE_HISTORY';
          WHEN item_id = 'pulmonaryEmbolism' THEN concept := 'VTE_HISTORY';
          WHEN item_id = 'vteHistory' THEN concept := 'VTE_HISTORY';
          WHEN item_id = 'familyThrombophilia' THEN concept := 'FAMILY_THROMBOPHILIA';
          WHEN item_id = 'varicoseVeins' THEN concept := 'VARICOSE_VEINS';
          WHEN item_id = 'legSwelling' THEN concept := 'LEG_SWELLING';

          -- renal
          WHEN item_id = 'ckd' THEN concept := 'CKD_OR_DIALYSIS';
          WHEN item_id = 'dialysis' THEN concept := 'CKD_OR_DIALYSIS';

          -- infectious / oncology
          WHEN item_id = 'activeCancer' THEN concept := 'ACTIVE_CANCER';

          -- woman
          WHEN item_id = 'pregnancy' THEN concept := 'PREGNANCY_OR_POSTPARTUM';
          WHEN item_id = 'postpartum' THEN concept := 'PREGNANCY_OR_POSTPARTUM';
          WHEN item_id = 'ocHrt' THEN concept := 'OC_OR_HRT';

          -- ponv
          WHEN item_id = 'ponvHistory' THEN concept := 'PONV_HISTORY';
          WHEN item_id = 'motionSickness' THEN concept := 'PONV_HISTORY';
          WHEN item_id = 'postOpNauseaVomiting' THEN concept := 'PONV_HISTORY';

          ELSE concept := NULL;
        END CASE;

        -- Only set scoringConcept if matched AND not already present (idempotent).
        IF concept IS NOT NULL AND (item ->> 'scoringConcept') IS NULL THEN
          item := jsonb_set(item, '{scoringConcept}', to_jsonb(concept));
        END IF;

        new_items := new_items || jsonb_build_array(item);
      END LOOP;

      updated_lists := jsonb_set(updated_lists, ARRAY[cat], new_items);
    END LOOP;

    UPDATE hospital_anesthesia_settings
       SET illness_lists = updated_lists,
           updated_at = NOW()
     WHERE id = rec.id;
  END LOOP;
END $$;
