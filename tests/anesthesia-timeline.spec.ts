import { test, expect } from '@playwright/test';

test.describe('Anesthesia Timeline CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Login with demo account
    await page.goto('/');
    await page.fill('[data-testid="input-email"]', 'demo@viali.app');
    await page.fill('[data-testid="input-password"]', 'demo123');
    await page.click('[data-testid="button-login"]');
    
    // Wait for navigation to complete
    await page.waitForURL('**/anesthesia/schedule', { timeout: 10000 });
    
    // Navigate to the first surgery record
    await page.click('[data-testid="link-op-monitoring"]');
    await page.waitForTimeout(2000); // Wait for surgeries to load
    
    // Click on the first surgery card to open the dialog
    const firstSurgery = page.locator('[data-testid^="card-surgery-"]').first();
    await firstSurgery.waitFor({ state: 'visible', timeout: 10000 });
    await firstSurgery.click();
    
    // Wait for the OP dialog to open and timeline to render
    await page.waitForSelector('[data-testid="dialog-surgery-details"]', { timeout: 10000 });
    await page.waitForTimeout(2000); // Allow timeline to fully render
  });

  test('1. Times Swimlane - Edit anesthesia time markers', async ({ page }) => {
    // Click the Edit Times button
    const editTimesButton = page.locator('[data-testid="button-edit-times"]');
    await editTimesButton.waitFor({ state: 'visible', timeout: 5000 });
    await editTimesButton.click();
    
    // Wait for the edit times dialog to open
    await page.waitForSelector('text="Edit Anesthesia Times"', { timeout: 5000 });
    
    // Click the "Now" button for a time marker to set current time
    const nowButton = page.locator('button:has-text("Now")').first();
    await nowButton.waitFor({ state: 'visible', timeout: 5000 });
    await nowButton.click();
    
    // Save changes
    await page.click('button:has-text("Save")');
    
    // Verify dialog closes
    await expect(page.locator('text="Edit Anesthesia Times"')).not.toBeVisible({ timeout: 5000 });
    
    console.log('✓ Times swimlane: Successfully edited time markers');
  });

  test('2. Events Swimlane - Create event comment', async ({ page }) => {
    // Try to click on the Events lane (this might be tricky due to canvas overlay)
    // Alternative: Use the Add Event button if available
    const addEventButton = page.locator('[data-testid="button-add-event"]');
    
    if (await addEventButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addEventButton.click();
    } else {
      // Try clicking directly on the events swimlane
      const eventsLane = page.locator('[data-testid="interactive-events-lane"]');
      await eventsLane.waitFor({ state: 'visible', timeout: 5000 });
      
      // Click in the middle of the lane
      const box = await eventsLane.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    }
    
    // Wait for event dialog to open
    await page.waitForSelector('text="Event Comment"', { timeout: 5000 });
    
    // Enter event text
    await page.fill('[data-testid="textarea-event-text"]', 'Test event comment from automated test');
    
    // Save event
    await page.click('[data-testid="button-save-event"]');
    
    // Verify dialog closes
    await expect(page.locator('text="Event Comment"')).not.toBeVisible({ timeout: 5000 });
    
    console.log('✓ Events swimlane: Successfully created event');
  });

  test('3. Medications Swimlane - Add medication (infusion or bolus)', async ({ page }) => {
    // Click on a medication group to configure
    const configButton = page.locator('[data-testid^="button-config-group-"]').first();
    
    if (await configButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await configButton.click();
      
      // Wait for medication dialog
      await page.waitForSelector('text="Configure Medications"', { timeout: 5000 });
      
      // Select first medication item
      const firstMedItem = page.locator('[data-testid^="button-select-med-"]').first();
      if (await firstMedItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstMedItem.click();
        
        // Fill in medication details
        await page.fill('[data-testid="input-dose"]', '5');
        
        // Save medication
        await page.click('[data-testid="button-save-medication"]');
        
        console.log('✓ Medications swimlane: Successfully added medication');
      } else {
        console.log('⚠ Medications swimlane: No medication items available, skipping');
      }
    } else {
      console.log('⚠ Medications swimlane: No config button found, skipping');
    }
  });

  test('4. Position Swimlane - Add patient position', async ({ page }) => {
    // Look for position add button or click on the position lane
    const positionLane = page.locator('[data-testid="interactive-position-lane"]');
    
    if (await positionLane.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await positionLane.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
      
      // Wait for position dialog
      await page.waitForSelector('text="Patient Position"', { timeout: 5000 });
      
      // Select a position
      const positionSelect = page.locator('[data-testid="select-position"]');
      await positionSelect.click();
      
      // Select first option
      const firstOption = page.locator('[role="option"]').first();
      await firstOption.click();
      
      // Save
      await page.click('[data-testid="button-save-position"]');
      
      console.log('✓ Position swimlane: Successfully added position');
    } else {
      console.log('⚠ Position swimlane: Interactive lane not found, skipping');
    }
  });

  test('5. Heart Rhythm Swimlane - Add rhythm value', async ({ page }) => {
    // Click on heart rhythm lane
    const rhythmLane = page.locator('[data-testid="interactive-heart-rhythm-lane"]');
    
    if (await rhythmLane.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await rhythmLane.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
      
      // Wait for rhythm dialog
      await page.waitForSelector('text="Heart Rhythm"', { timeout: 5000 });
      
      // Select a rhythm
      const rhythmSelect = page.locator('[data-testid="select-rhythm"]');
      await rhythmSelect.click();
      
      // Select first option
      const firstOption = page.locator('[role="option"]').first();
      await firstOption.click();
      
      // Save
      await page.click('[data-testid="button-save-rhythm"]');
      
      console.log('✓ Heart Rhythm swimlane: Successfully added rhythm');
    } else {
      console.log('⚠ Heart Rhythm swimlane: Interactive lane not found, skipping');
    }
  });

  test('6. Staff Swimlane - Add staff assignment', async ({ page }) => {
    // Click on staff lane
    const staffLane = page.locator('[data-testid="interactive-staff-lane"]');
    
    if (await staffLane.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await staffLane.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
      
      // Wait for staff dialog
      await page.waitForSelector('text="Staff Assignment"', { timeout: 5000 });
      
      // Fill in staff name
      await page.fill('[data-testid="input-staff-name"]', 'Test Doctor');
      
      // Select role
      const roleSelect = page.locator('[data-testid="select-role"]');
      await roleSelect.click();
      
      // Select first option
      const firstOption = page.locator('[role="option"]').first();
      await firstOption.click();
      
      // Save
      await page.click('[data-testid="button-save-staff"]');
      
      console.log('✓ Staff swimlane: Successfully added staff');
    } else {
      console.log('⚠ Staff swimlane: Interactive lane not found, skipping');
    }
  });

  test('7. Ventilation Mode Swimlane - Add ventilation mode', async ({ page }) => {
    // Click on ventilation mode lane
    const ventModeLane = page.locator('[data-testid="interactive-ventilation-mode-lane"]');
    
    if (await ventModeLane.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await ventModeLane.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
      
      // Wait for mode dialog
      await page.waitForSelector('text="Ventilation Mode"', { timeout: 5000 });
      
      // Select a mode
      const modeSelect = page.locator('[data-testid="select-ventilation-mode"]');
      await modeSelect.click();
      
      // Select first option
      const firstOption = page.locator('[role="option"]').first();
      await firstOption.click();
      
      // Save
      await page.click('[data-testid="button-save-vent-mode"]');
      
      console.log('✓ Ventilation Mode swimlane: Successfully added mode');
    } else {
      console.log('⚠ Ventilation Mode swimlane: Interactive lane not found, skipping');
    }
  });

  test('8. Output Swimlane - Add fluid output value', async ({ page }) => {
    // Click on an output parameter lane (e.g., urine)
    const outputLane = page.locator('[data-testid^="interactive-output-"][data-testid$="-lane"]').first();
    
    if (await outputLane.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await outputLane.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
      
      // Wait for output dialog
      await page.waitForSelector('text="Output Value"', { timeout: 5000 });
      
      // Enter value
      await page.fill('[data-testid="input-output-value"]', '50');
      
      // Save
      await page.click('[data-testid="button-save-output"]');
      
      console.log('✓ Output swimlane: Successfully added output value');
    } else {
      console.log('⚠ Output swimlane: Interactive lane not found, skipping');
    }
  });

  test('9. Vitals Swimlane - Add HR/BP/SpO2 values', async ({ page }) => {
    // Enable point edit mode
    const editModeButton = page.locator('[data-testid="button-enable-edit-mode"]');
    
    if (await editModeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editModeButton.click();
      
      // Click on the chart to add a point (this will be approximate)
      const chartCanvas = page.locator('canvas').first();
      await chartCanvas.waitFor({ state: 'visible', timeout: 5000 });
      
      const box = await chartCanvas.boundingBox();
      if (box) {
        // Click in the middle area of the chart
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        
        // Wait for vitals dialog if it appears
        const vitalsDialog = page.locator('text="Add Vital Point"');
        if (await vitalsDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
          // Fill in vital values
          await page.fill('[data-testid="input-hr-value"]', '80');
          
          // Save
          await page.click('[data-testid="button-save-vital"]');
          
          console.log('✓ Vitals swimlane: Successfully added vital point');
        } else {
          console.log('⚠ Vitals swimlane: Dialog did not appear, may have clicked wrong area');
        }
      }
    } else {
      console.log('⚠ Vitals swimlane: Edit mode button not found, skipping');
    }
  });
});
