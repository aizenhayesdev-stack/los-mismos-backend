import AuthenticationHelper from "./authentication.helper";
import PaginateHelper from "./pagination.helper";

class Helper {

    public PaginateHelper: PaginateHelper;
    public AuthenticationHelper: AuthenticationHelper;

    constructor() {
        this.PaginateHelper = new PaginateHelper();
        this.AuthenticationHelper = new AuthenticationHelper()
    }
}

export default new Helper();