export interface PaginationParams {
    page?: number;
    limit?: number;
    skip?: number;
    take?: number;
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}
