const LINEAR_GRAPHQL = "https://api.linear.app/graphql";

export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

export interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  updatedAt: string;
  state: { name: string; type: string };
  team: { id: string; key: string } | null;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export async function linearGraphql<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(LINEAR_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Linear HTTP ${res.status}`);
  }
  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  if (!body.data) {
    throw new Error("Linear: empty response");
  }
  return body.data;
}

const TEAMS_QUERY = `
  query LinearTeams($after: String) {
    teams(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id key name }
    }
  }
`;

type LinearTeamsQuery = {
  teams: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: { id: string; key: string; name: string }[];
  };
};

export async function fetchAllLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const teams: LinearTeam[] = [];
  let after: string | null = null;
  for (let i = 0; i < 20; i++) {
    const data: LinearTeamsQuery = await linearGraphql<LinearTeamsQuery>(apiKey, TEAMS_QUERY, { after });
    for (const n of data.teams.nodes) {
      teams.push({ id: n.id, key: n.key, name: n.name });
    }
    if (!data.teams.pageInfo.hasNextPage) break;
    after = data.teams.pageInfo.endCursor;
    if (!after) break;
  }
  return teams;
}

const ISSUES_PAGE = `
  query LinearIssues($teamIds: [ID!]!, $email: String!, $after: String) {
    issues(
      filter: {
        team: { id: { in: $teamIds } }
        assignee: { email: { eq: $email } }
      }
      first: 50
      after: $after
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        identifier
        title
        updatedAt
        state { name type }
        team { id key }
      }
    }
  }
`;

type LinearIssuesQuery = {
  issues: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: LinearIssueNode[];
  };
};

export async function fetchLinearIssuesForAssignee(
  apiKey: string,
  teamIds: string[],
  assigneeEmail: string,
): Promise<LinearIssueNode[]> {
  if (teamIds.length === 0 || !assigneeEmail.trim()) return [];

  const out: LinearIssueNode[] = [];
  let after: string | null = null;
  for (let page = 0; page < 50; page++) {
    const data: LinearIssuesQuery = await linearGraphql<LinearIssuesQuery>(apiKey, ISSUES_PAGE, {
      teamIds,
      email: assigneeEmail.trim(),
      after,
    });
    for (const n of data.issues.nodes) {
      out.push(n);
    }
    if (!data.issues.pageInfo.hasNextPage) break;
    after = data.issues.pageInfo.endCursor;
    if (!after) break;
  }
  return out;
}
