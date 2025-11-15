export const webEmailTemplate = (emailAddress: string, phoneNumber: string): string => {

    return `
        <!DOCTYPE html >
        <html lang= "en-US" >

        <head>
        <meta content="text/html; charset=utf-8" http - equiv="Content-Type" />
            <title>ROZZ FIZ | Contact Form </title>
                < meta name = "description" content = " - New User." />
                    <style type="text/css" >
                        a:hover {
        text - decoration: underline!important;
    }

    .uploaded - image {
    width: 100px;
    /* Adjust size as needed */
    height: auto;
    margin: 5px;
    border - radius: 5px;
    box - shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
}
</style>
    </head>

    < body style = "margin: 0px; background-color: #f2f3f8" >
        <table cellspacing="0" border = "0" cellpadding = "0" width = "100%" bgcolor = "#f2f3f8" >
            <tr>
            <td>
            <table style="background-color: #f2f3f8; max-width: 670px; margin: 0 auto" width = "100%" border = "0"
align = "center" cellpadding = "0" cellspacing = "0" >
    <tr>
    <td style="height: 80px" >& nbsp; </td>
        </tr>
        < tr >
        <td style="height: 20px" >& nbsp; </td>
            </>
            < tr >
            <td>
            <table width="95%" border = "0" align = "center" cellpadding = "0" cellspacing = "0" style = "background: #fff; border-radius: 3px; text-align: center;
box - shadow: 0 6px 18px 0 rgba(0, 0, 0, 0.06); ">
    < tr >
    <td style="height: 40px" >
        <h3>Rozz Fix - Contact Form </h3>
            </td>
            </>
            < tr >
            <td style="padding: 0 35px; text-align: start" >
                <h1 style="color: #1e1e2d; font-weight: 500; margin: 0; font-size: 32px;" > Contact Form </h1>
                    < span
style = "display: inline-block; margin: 29px 0 26px; border-bottom: 1px solid #cecece; width: 100px;" > </>

    < h4 style = "color: #455056; font-size: 15px; line-height: 24px;" > EMAIL ADDRESS: ${emailAddress} </>
        < h4 style = "color: #455056; font-size: 15px; line-height: 24px;" > PHONE NUMBER: ${phoneNumber} </>
            < !--Image Section-- >
                <!-- < h4 style = "color: #1e1e2d; font-size: 18px; margin-top: 20px;" > Uploaded Images: </>
                    < div style = "display: flex; flex-wrap: wrap; gap: 10px;" >
                        {{ #each uploadedFiles }}
<img src="{{this}}" style = "width: 150px; height: auto; margin: 5px; border-radius: 5px; display: block;" alt = "Uploaded Image" >
    {{/each }}
</> -->
    </td>
    </tr>
    < tr >
    <td style="height: 40px" >& nbsp; </td>
        </>
        </table>
        </td>
        </tr>
        < tr >
        <td style="height: 20px" >& nbsp; </td>
            </>
            < tr >
            <td style="height: 80px" >& nbsp; </td>
                </>
                </table>
                </td>
                </tr>
                </table>
                </body>

                </html>
                `
}