export const get_full_user_profile_population_from_auth_query = {
    path: 'profile',
    populate: [{
        path: 'profilePicture',
        model: 'Media'
    },
    {
        path: 'services',
        model: 'Services'
    },
    {
        path: 'certificate',
        model: 'Media'
    },
    {
        path: 'businessLicense',
        model: 'Media'
    },
    {
        path: 'insuranceCertificate',
        model: 'Media'
    },
    {
        path: 'compensationInsurance',
        model: 'Media'
    },
    {
        path: 'TradeLicenses',
        model: 'Media'
    },
    ]
}