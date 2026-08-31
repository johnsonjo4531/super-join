# super-join execution plan

## Current ToDos

If the api of the todo is not already covered by existing documents then add the todo in its own ai-design-doc file and/or as an addition to any of the existing ai-design-docs is relates to. If existing design-docs need to be updated please do so.

- [ ] Create a hydration function in super-join's main api that is general enough to handle any hydration step.
- [ ] Add a function that encompasses compile and hydrate steps called superjoin. Make it so the user provides a callback function that they can call their db driver with provided artifacts. Make it apparent this is the main api that user's should be calling by making it more prominent in user-facing-docs.
- [ ] Make a superjoin.graphql function (where superjoin there is the superjoin function from the previous todo) that combines graphqlToSQL and the superjoin api.
- [ ] move super-join's Entity, Field, and Relation decorators and all other decorator specific apis e.g. modelFromClasses (besides the graphql specific ones) to super-join/decorators
- [ ] Move the super-join/graphql/decorators path to be super-join/decorators/graphql instead add the new file to the api docs in the user-facing-docs.
- [ ] Add an example named examples/decorators-graphql-js that is written in typescript uses super-join decorator patterns and uses graphql-js and allows you to start it with `make example_decorators-graphql-js` from the root of the project.
- [ ] Implement text and varchar data-types
- [ ] Fix the github url that is in the user-facing-docs so it points to <https://github.com/johnsonjo4531/super-join>
- [ ] Make two seperate guide sections in the user-facing-docs on how to use super-join one targeted specifically towards typescript-decorators and one using the core api. Make the typescript decorator pattern the more prominent one and show it as the preferred pattern of usage. You can remove the current guides or just move them to their respective places in the new guide section, but make sure most information in old guides is carried over if still relevant. Each of the two guides should be in their own sections in the user-facing-docs. Each guide section should be roughly the same number of files (which I'll call steps for short here) with permission to have specific guides for the core guides or decorator guides as needed. The steps for both should include: and intro which explains what choice they are making by choosing either the given decorator or core api, a Building a GraphQL server step that shows them how to use the given api (decorator or core depending on the guide section) to build a GraphQL server, and a filtering pagination and hooks section for the given api, and the core api guide should still list out current information about result shape and hydration.
