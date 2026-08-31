// Fixtures for GraphQL frontend tests.
//
// We build real GraphQL AST nodes via `graphql.parse` so the resolver info we
// hand to `graphqlToSQL` reflects the shapes the production code actually reads
// (fieldNodes, arguments, selection sets, variables). We only populate the
// fields of `GraphQLResolveInfo` that the implementation dereferences.

import {
  Kind,
  parse,
  type FragmentDefinitionNode,
  type GraphQLResolveInfo,
  type OperationDefinitionNode,
} from "graphql";

import { type Model, model } from "./model.js";
import type { GraphQLModel } from "../../src-js/graphql.js";

export function makeModel(
  overrides: Partial<GraphQLModel> = {},
): GraphQLModel {
  const resolvers = {
    entityForField: (fieldName: string): bigint | undefined => {
      switch (fieldName) {
        case "user":
        case "users":
          return 0n;
        case "posts":
        case "post":
          return 1n;
        default:
          return undefined;
      }
    },
    relationForField: (
      entityId: bigint,
      fieldName: string,
    ): bigint | undefined => {
      if (entityId === 0n && fieldName === "posts") {
        return 0n;
      }
      return undefined;
    },
    fieldForEntity: (
      entityId: bigint,
      fieldName: string,
    ): bigint | undefined => {
      switch (fieldName) {
        case "id":
          return entityId === 1n ? 2n : 0n;
        case "name":
          return 1n;
        case "title":
          return 3n;
        default:
          return undefined;
      }
    },
  };

  return {
    model,
    dialect: "postgres",
    ...resolvers,
    ...overrides,
  };
}

/** A model with one non-selectable field, for the selectability rule. */
export function modelWithNonSelectable(): Model {
  const clone: Model = {
    entities: [
      {
        ...model.entities[0],
        fields: [
          ...model.entities[0].fields,
          {
            id: 9n,
            identifier: { components: ["password"] },
            dataType: "int64",
            nullable: false,
            selectable: false,
          },
        ],
      },
    ],
  };
  return clone;
}

export interface FakeResolveInfoArgs {
  query: string;
  fieldName: string;
  parentType: { name: string };
  returnType: { name: string };
  variables?: Record<string, unknown>;
}

/**
 * Build a minimal but structurally-accurate GraphQLResolveInfo from a query
 * document. Only the fields the compiler reads are populated.
 */
export function makeResolveInfo({
  query,
  fieldName,
  parentType,
  returnType,
  variables,
}: FakeResolveInfoArgs): GraphQLResolveInfo {
  const document = parse(query);
  const operation = document.definitions.find(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION,
  ) as OperationDefinitionNode | undefined;
  if (!operation) {
    throw new Error("test fixture: first definition is not an operation");
  }
  const fieldNodes = operation.selectionSet.selections;
  const rootField = fieldNodes[0];
  if ("name" in rootField && rootField.name.value !== fieldName) {
    throw new Error(
      `test fixture: expected root field "${fieldName}", got "${rootField.name.value}"`,
    );
  }
  const variableValues: Record<string, unknown> = { ...variables };
  for (const variable of operation.variableDefinitions ?? []) {
    variableValues[variable.variable.name.value] ??= undefined;
  }
  const fragments: Record<string, FragmentDefinitionNode> = {};
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments[definition.name.value] = definition;
    }
  }

  return {
    operation: {
      kind: Kind.OPERATION_DEFINITION,
      operation: operation.operation,
    },
    fieldNodes: fieldNodes as never,
    variableValues,
    fragments,
    parentType,
    returnType,
    fieldName,
  } as unknown as GraphQLResolveInfo;
}
