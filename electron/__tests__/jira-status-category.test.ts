import { jiraStatusCategoryFromApi } from "../jira-status-category";

describe("jiraStatusCategoryFromApi", () => {
  it('maps "done" to "done"', () => {
    expect(jiraStatusCategoryFromApi("done")).toBe("done");
  });

  it('maps "indeterminate" to "in_progress"', () => {
    expect(jiraStatusCategoryFromApi("indeterminate")).toBe("in_progress");
  });

  it('maps "new" to "todo"', () => {
    expect(jiraStatusCategoryFromApi("new")).toBe("todo");
  });

  it('maps empty string to "todo"', () => {
    expect(jiraStatusCategoryFromApi("")).toBe("todo");
  });

  it("is case insensitive", () => {
    expect(jiraStatusCategoryFromApi("DONE")).toBe("done");
    expect(jiraStatusCategoryFromApi("Done")).toBe("done");
    expect(jiraStatusCategoryFromApi("INDETERMINATE")).toBe("in_progress");
    expect(jiraStatusCategoryFromApi("Indeterminate")).toBe("in_progress");
    expect(jiraStatusCategoryFromApi("NEW")).toBe("todo");
  });

  it('maps unknown keys to "todo"', () => {
    expect(jiraStatusCategoryFromApi("unknown")).toBe("todo");
    expect(jiraStatusCategoryFromApi("something_else")).toBe("todo");
  });
});
