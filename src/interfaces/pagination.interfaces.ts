export interface PaginationResult<T> {
    totalDocs: number;
    [key: string]: number | boolean | T[];
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

export interface AggregationResult<T> {
    totalDocs: number;
    [key: string]: number | boolean | T[];
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}