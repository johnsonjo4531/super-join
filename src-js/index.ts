import {
  type GraphQLResolveInfo,
  Kind,
  OperationTypeNode,
  print,
} from "graphql";
export type * from "../pkg/super_join.js";
export * from "../pkg/super_join.js";

export function extractSubQuery(info: GraphQLResolveInfo): string {
  const fieldNode = info.fieldNodes[0];

  // Rewrap the current field in a Document so it's a valid query
  const doc = {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation: OperationTypeNode.QUERY,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [fieldNode],
        },
      },
      ...Object.values(info.fragments),
    ],
  } as const;

  return print(doc); // returns: `{ posts { title comments { content } } }`
}
