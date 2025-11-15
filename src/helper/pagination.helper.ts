

import { Document, Model, FilterQuery, PopulateOptions, PipelineStage } from 'mongoose';
import { AggregationResult, PaginationResult } from '../interfaces/pagination.interfaces';


class PaginateHelper {

    async customPaginate<T extends Document>(
        key: string,
        model: Model<T>,
        query: FilterQuery<T>,
        options: {
            page?: number;
            limit?: number;
            sort?: Record<string, 1 | -1>;
            select?: string;
            populate?: PopulateOptions | Array<string | PopulateOptions>;
            lean?: boolean;
        }
    ): Promise<PaginationResult<T>> {
        const {
            page = 1,
            limit = 10,
            sort = { createdAt: -1 },
            select,
            populate,
            lean = true,
        } = options;

        const skip = (page - 1) * limit;

        try {
            const [totalDocs, data] = await Promise.all([
                model.countDocuments(query),
                model
                    .find(query)
                    .select(select || '')
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .lean(lean)
                    .populate(populate || [])
            ]);

            const totalPages = Math.ceil(totalDocs / limit);

            return {
                totalDocs,
                [key]: data as T[],
                currentPage: page,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            };
        } catch (error) {
            console.error('Error in customPaginate:', error);
            throw new Error('Failed to paginate results.');
        }
    }

    async customAggregation<T extends Document>(
        key: string,
        model: Model<T>,
        query: PipelineStage[],
        options: {
            page?: number;
            limit?: number;
            sort?: Record<string, 1 | -1>;
            select?: string;
            populate?: PopulateOptions | Array<string | PopulateOptions>;
            lean?: boolean;
        }
    ): Promise<AggregationResult<T>> {
        const {
            page = 1,
            limit = 10,
            sort = { createdAt: -1 },
            select,
            populate,
            lean = true,
        } = options;

        const skip = (page - 1) * limit;

        try {
            const aggregationWithPagination: PipelineStage[] = [
                ...query,
                { $skip: skip },
                { $limit: limit },
                { $sort: sort },
            ];

            const totalDocsQuery: PipelineStage[] = [
                ...query,
                { $count: "totalDocs" },
            ];
            const totalDocsResult = await model.aggregate(totalDocsQuery);
            const totalDocs = totalDocsResult.length > 0 ? totalDocsResult[0].totalDocs : 0;

            const data = await model.aggregate(aggregationWithPagination).exec();

            const totalPages = Math.ceil(totalDocs / limit);

            return {
                totalDocs,
                [key]: data as T[],
                currentPage: page,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            };
        } catch (error) {
            console.error('Error in customAggregation:', error);
            throw new Error('Failed to aggregate results.');
        }
    }

}

export default PaginateHelper;