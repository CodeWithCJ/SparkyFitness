# Food API

## GET /api/foods

Gets recent and top foods. This endpoint is used for the "Recent" tab in the Add Food Entry screen.

## GET /api/foods/foods-paginated

`routes/foodCrudRoutes.js:256`

Searches for foods based on searchTerm. foodFilter is unused.

### Query Parameters

| Param | Type | Description |
|---|---|---|
| searchTerm | string | Text to search for |
| foodFilter | string | Filter to apply to the food list (unused) |
| currentPage | integer | Page number for pagination |
| itemsPerPage | integer | Number of items per page |
| sortBy | string | Field to sort by (name:asc\|desc) |

### Response (200)

```json
{
  "foods": [ /* array of Food objects */ ],
  "totalCount": 42
}
```
