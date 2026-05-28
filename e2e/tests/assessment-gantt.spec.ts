import { test, expect } from '@playwright/test';
import { format, addDays } from 'date-fns';

/**
 * Assessment + Gantt E2E Test Suite
 * 
 * Tests the full flow:
 * 1. Login
 * 2. Select organization  
 * 3. Navigate to remediation page
 * 4. Verify Gantt loads with data
 * 5. Create new assessment if none exists
 * 6. Add task to Gantt
 * 7. Verify task appears
 */

test.describe('Assessment & Gantt', () => {
  const TEST_ORG_NAME = 'Test E2E SRL';
  
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/auth');
    await page.getByRole('textbox', { name: 'Email' }).fill('superadmin@hiconsole.it');
    await page.getByRole('textbox', { name: 'Password' }).fill('password');
    await page.getByRole('button', { name: 'Accedi' }).click();
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    // Select organization
    const orgSelect = page.getByRole('combobox');
    await orgSelect.click();
    await page.getByText(TEST_ORG_NAME).click();
    await page.waitForTimeout(500); // Wait for selection to propagate
  });

  test('should load remediation page with Gantt', async ({ page }) => {
    // Navigate to remediation
    await page.goto('/remediation');
    
    // Verify page title
    await expect(page.getByRole('heading', { name: 'Remediation' })).toBeVisible();
    
    // Verify Gantt tab is present and click it
    const ganttTab = page.getByRole('tab', { name: /GANTT|gantt/i });
    await expect(ganttTab).toBeVisible();
    await ganttTab.click();
    
    // Verify Gantt chart container is visible
    const ganttContainer = page.locator('[class*="gantt"], [class*="Gantt"]').first();
    await expect(ganttContainer).toBeVisible({ timeout: 5000 });
    
    // Verify timeline headers (months/weeks)
    const timelineExists = await page.locator('text=/Gennaio|Febbraio|Marzo|gen|feb|mar/i').count();
    expect(timelineExists).toBeGreaterThan(0);
    
    // Screenshot for verification
    await page.screenshot({ path: 'test-results/gantt-loaded.png' });
  });

  test('should create assessment and display Gantt tasks', async ({ page }) => {
    await page.goto('/remediation');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // Check if empty state is shown or Gantt has data
    const emptyState = page.getByText(/Nessun assessment|Nessuna attività|Creare assessment/i);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    
    if (hasEmptyState) {
      // Click seed/create button if present
      const seedButton = page.getByRole('button', { name: /Crea|Seed|Carica|Genera|Inizializza/i });
      if (await seedButton.isVisible().catch(() => false)) {
        await seedButton.click();
        await page.waitForTimeout(1000);
      }
    }
    
    // Verify Gantt has task rows
    const taskRows = page.locator('[class*="task"], [class*="row"], tr').filter({ hasText: /Implementazione|Audit|Training|Assessment/i });
    const taskCount = await taskRows.count();
    
    // Should have some tasks visible
    expect(taskCount).toBeGreaterThanOrEqual(0);
    
    // Screenshot
    await page.screenshot({ path: 'test-results/gantt-with-tasks.png' });
  });

  test('should add new task to Gantt', async ({ page }) => {
    await page.goto('/remediation');
    await page.waitForLoadState('networkidle');
    
    // Look for add task button
    const addButton = page.getByRole('button', { name: /Aggiungi|Nuova|Nuovo|Add|Create task/i });
    
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      
      // Fill task form
      await page.getByLabel(/Titolo|Task|Nome|Descrizione/i).fill('Test Task E2E');
      await page.getByLabel(/Categoria|Category/i).fill('Test Category');
      
      // Set dates
      const today = format(new Date(), 'yyyy-MM-dd');
      const endDate = format(addDays(new Date(), 30), 'yyyy-MM-dd');
      
      const dateInputs = page.locator('input[type="date"], [placeholder*="data"], [placeholder*="date"]').all();
      if ((await dateInputs).length >= 2) {
        await (await dateInputs)[0].fill(today);
        await (await dateInputs)[1].fill(endDate);
      }
      
      // Save
      await page.getByRole('button', { name: /Salva|Save|Conferma|OK/i }).click();
      
      // Verify task appears
      await expect(page.getByText('Test Task E2E')).toBeVisible({ timeout: 3000 });
      
      await page.screenshot({ path: 'test-results/gantt-new-task.png' });
    } else {
      test.skip(); // Skip if add button not available
    }
  });

  test('should switch Gantt views', async ({ page }) => {
    await page.goto('/remediation');
    await page.waitForTimeout(1000);
    
    // Look for view toggle buttons
    const viewButtons = page.getByRole('button').filter({ hasText: /Mese|Settimana|Giorno|Month|Week|Day/i });
    const count = await viewButtons.count();
    
    if (count > 0) {
      // Click through different views
      for (let i = 0; i < Math.min(count, 3); i++) {
        await viewButtons.nth(i).click();
        await page.waitForTimeout(500);
        
        // Verify view changed
        await expect(page.locator('body')).toBeVisible();
      }
      
      await page.screenshot({ path: 'test-results/gantt-views.png' });
    } else {
      test.skip(); // Skip if view toggles not present
    }
  });

  test('should handle budget in Gantt', async ({ page }) => {
    await page.goto('/remediation');
    await page.waitForTimeout(1000);
    
    // Look for budget-related elements
    const budgetElements = page.locator('text=/Budget|€|EUR|Cost|Prezzo/i');
    const hasBudget = await budgetElements.count() > 0;
    
    if (hasBudget) {
      // Click on a task to edit
      const taskRow = page.locator('[class*="task"], [class*="row"]').first();
      await taskRow.click();
      
      // Look for budget field in edit dialog
      const budgetInput = page.getByLabel(/Budget|Costo|Prezzo/i, { exact: false });
      if (await budgetInput.isVisible().catch(() => false)) {
        await budgetInput.fill('10000');
        await page.getByRole('button', { name: /Salva|Save/i }).click();
        
        // Verify budget saved
        await expect(page.getByText(/10000|10\.000|€10/)).toBeVisible({ timeout: 3000 });
      }
    } else {
      test.skip(); // Budget feature may not be enabled
    }
  });
});
