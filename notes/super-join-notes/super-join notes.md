Tasks to get done on super-join

- [x] Talk to Britney about what features it needs
- [ ] See if there is any other way to write the queries we do besides batching?
- [ ] Support batching requests
- [ ] Look into the possibility of sendings arguments and context on views?
- [ ] Feature complete with join-monster
	- [ ] ORDER BY
	- [ ] Many-to-many with Junction table
	- [ ] WHERE clause (make sure it's working)
	- [ ] Call it like join-monster
	- [ ] Check all field metadata
	- [ ] Check all object metadata (alwaysFetch may have been missed)
	- [ ] Pagination
		- [ ] Support all paging types!
		- [ ] Make sure it works with batching...
		- [ ] allow sqlPageLimit
		- [ ] allow sqlDefaultPageSize
	- [ ] 