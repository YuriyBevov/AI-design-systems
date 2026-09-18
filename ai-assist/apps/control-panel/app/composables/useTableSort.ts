import { ref, type Ref } from "vue";

export type TableSortDirection = "ascending" | "descending";
export type TableSortValue = string | number | boolean | null | undefined;

export const useTableSort = <Column extends string>(
  initialColumn: Column,
  initialDirection: TableSortDirection = "ascending",
): {
  sortColumn: Ref<Column>;
  sortDirection: Ref<TableSortDirection>;
  toggleSort: (column: Column) => void;
} => {
  const sortColumn = ref(initialColumn) as Ref<Column>;
  const sortDirection = ref(initialDirection) as Ref<TableSortDirection>;
  const toggleSort = (column: Column): void => {
    if (sortColumn.value === column) {
      sortDirection.value = sortDirection.value === "ascending" ? "descending" : "ascending";
      return;
    }
    sortColumn.value = column;
    sortDirection.value = "ascending";
  };
  return { sortColumn, sortDirection, toggleSort };
};

export const sortTableRows = <Row>(
  rows: readonly Row[],
  direction: TableSortDirection,
  valueOf: (row: Row) => TableSortValue,
): Row[] =>
  [...rows].sort((leftRow, rightRow) => {
    const left = valueOf(leftRow);
    const right = valueOf(rightRow);
    const leftEmpty = left === null || left === undefined || left === "";
    const rightEmpty = right === null || right === undefined || right === "";
    if (leftEmpty || rightEmpty) {
      if (leftEmpty && rightEmpty) return 0;
      return leftEmpty ? 1 : -1;
    }
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "ru-RU", {
            numeric: true,
            sensitivity: "base",
          });
    return direction === "ascending" ? comparison : -comparison;
  });
