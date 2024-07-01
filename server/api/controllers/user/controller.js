import Joi from 'joi';
import apiError from '../../../helper/apiError';
import response from '../../../../assests/response';
import bcrypt from "bcryptjs";
import { userServices } from "../../services/user";
import status from '../../../enums/status';
import commonFunction from '../../../helper/util';
import responseMessage from '../../../../assests/responseMessage';



const { checkUserExists, createUser, userUpdate, findUser, findUserPagination } = userServices;


export const userController = {


    /**
    * @swagger
    * /user/loginUser:
    *   post:
    *     tags:
    *       - USER
    *     description: Login a user
    *     produces:
    *       - application/json
    *     parameters:
    *       - name: loginUserRequest
    *         description: User login request
    *         in: body
    *         required: true
    *         schema:
    *           type: object
    *           properties:
    *             emailOrMobile:
    *               type: string
    *             password:
    *               type: string
    *             deviceType:
    *               type: string
    *             deviceToken:
    *               type: string
    *           required:
    *             - emailOrMobile
    *             - password
    *     responses:
    *       200:
    *         description: Successful login
    *       404:
    *         description: User not found
    *       401:
    *         description: Incorrect login
    */


    async loginUser(req, res, next) {
        const validationSchema = Joi.object({
            emailOrMobile: Joi.string().required(),
            password: Joi.string().required(),
            deviceType: Joi.string().empty('').optional(),
            deviceToken: Joi.string().empty('').optional(),
        });
        try {
            const { error, value } = validationSchema.validate(req.body);
            if (error) {
                return next(error);
            }
            const { emailOrMobile, password } = value;
            const user = await checkUserExists({
                $and: [
                    { status: { $ne: status.DELETE } },
                    { $or: [{ email: emailOrMobile }, { mobileNumber: emailOrMobile }] }
                ]
            });
            if (!user) {
                throw apiError.notFound(responseMessage.USER_NOT_FOUND);
            }
            if (user.status === status.BLOCK) {
                throw apiError.unauthorized(responseMessage.ACCOUNT_APPROVAL);
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                throw apiError.unauthorized(responseMessage.INCORRECT_LOGIN);
            }

            if (!user.isUserVerfied) {
                let otp = commonFunction.getOTP();
                var otpTime = new Date().getTime() + 300000;
                await commonFunction.sendMail(value.email, value.name, otp)
                await userUpdate({ _id: user._id }, { otp: otp, otpTime: otpTime })
            }


            const token = await commonFunction.getToken({ userId: user._id });
            const userResponse = {
                _id: user._id,
                token: token,
                name: user.name,
                profilePic: user.profilePic,
                isUserVerfied: user.isUserVerfied,
                createdAt: user.createdAt,
                userName: user.userName,
                userType: user.userType,
                approveStatus: user.approveStatus,
                status: user.status,
            };
            return res.json(new response(userResponse, responseMessage.LOGIN));
        } catch (error) {
            return next(error);
        }
    },


    /**
 * @swagger
 * /user/signUp:
 *   post:
 *     tags:
 *       - USER
 *     description: Sign Up
 *     consumes:
 *       - multipart/form-data
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: formData
 *         name: name
 *         type: string
 *         required: true
 *       - in: formData
 *         name: email
 *         type: string
 *         required: true
 *       - in: formData
 *         name: userName
 *         type: string
 *         required: true
 *       - in: formData
 *         name: dob
 *         type: string
 *         required: true
 *       - in: formData
 *         name: mobileNumber
 *         type: string
 *         required: true
 *       - in: formData
 *         name: address
 *         type: string
 *         required: true
 *       - in: formData
 *         name: gender
 *         type: string
 *         required: true
 *       - in: formData
 *         name: countryCode
 *         type: string
 *         required: true
 *       - in: formData
 *         name: password
 *         type: string
 *         required: true
 *       - in: formData
 *         name: deviceToken
 *         type: string
 *         required: false
 *       - in: formData
 *         name: files
 *         type: file
 *         required: false
 *         description: Profile picture
 *     responses:
 *       200:
 *         description: Successful signup
 *       404:
 *         description: User not found
 */

    async userSignUp(req, res, next) {
        const validationSchema = Joi.object({
            name: Joi.string().required(),
            email: Joi.string().required(),
            userName: Joi.string().required(),
            dob: Joi.date().required(),
            mobileNumber: Joi.string().required(),
            address: Joi.string().required(),
            gender: Joi.string().required(),
            countryCode: Joi.string().required().max(3),
            password: Joi.string().required(),
            deviceToken: Joi.string().empty('').optional(),
        });
        try {
            const { error, value } = validationSchema.validate(req.body);

            if (error) {
                return next(error);
            }


            let user = await checkUserExists({ $or: [{ mobileNumber: value.mobileNumber }, { email: value.email }] });

            if (user) {
                throw apiError.alreadyExist(responseMessage.USER_ALREADY_EXIST);
            }
            let imageUrlResult;

            if (req.files.length != 0) {
                for (const image of req.files) {

                    let imageResult = await commonFunction.uploadFile(
                        image.path,
                        image.originalname
                    );
                    imageUrlResult = imageResult;

                    await commonFunction.removeFile(image.path)
                }
            }





            value.password = bcrypt.hashSync(req.body.password, 10);
            let otp = commonFunction.getOTP();
            var otpTime = new Date().getTime() + 300000;
            value.otp = otp;
            value.otpTime = otpTime;
            value.profilePic = imageUrlResult;

            await commonFunction.sendMail(value.email, value.name, otp)

            const result = await createUser(value);

            const userResponse = {
                _id: result._id,
                name: result.name,
                profilePic: result.profilePic,
                isUserVerfied: result.isUserVerfied,
                createdAt: result.createdAt,
                userName: result.userName,
                userType: result.userType,
                approveStatus: result.approveStatus,
                status: result.status,
            };


            return res.json(new response(userResponse, responseMessage.USER_CREATED));

        } catch (error) {
            return next(error);
        }
    },


    /**
    * @swagger
    * /user/verifyOTP:
    *   get:
    *     tags:
    *       - USER
    *     description: Verify OTP
    *     produces:
    *       - application/json
    *     parameters:
    *       - in: query
    *         name: userId
    *         type: string
    *         description: _id 
    *         required: true
    *       - in: query
    *         name: otp
    *         type: string
    *         description: otp
    *         required: true
    *     responses:
    *       200:
    *         description: Successful signup
    *       404:
    *         description: User not found
    */

    async verifyOTP(req, res, next) {
        let validateSchema = Joi.object({
            otp: Joi.string().required().min(6).max(6),
            userId: Joi.string().required()
        })
        try {

            const { error, value } = validateSchema.validate(req.query)
            if (error) {
                return next(error);
            }

            let userDetail = await checkUserExists({ _id: value.userId })

            if (!userDetail) {
                throw apiError.notFound(responseMessage.USER_NOT_FOUND)
            }

            if (new Date().getTime() > userDetail.otpTime) {
                throw apiError.badRequest(responseMessage.OTP_EXPIRED);
            }

            if (userDetail.otp !== value.otp) {
                throw apiError.invalid(responseMessage.INCORRECT_OTP)
            }

            await userUpdate({ _id: userDetail._id }, { isUserVerfied: true })


            return res.json(new response({}, responseMessage.OTP_VERIFY));


        } catch (error) {
            return next(error);
        }

    },



    /**
    * @swagger
    * /user/resendOTP:
    *   get:
    *     tags:
    *       - USER
    *     description: Resend OTP
    *     produces:
    *       - application/json
    *     parameters:
    *       - in: query
    *         name: mobileNumberOREmail
    *         type: string
    *         description: mobileNumberOREmail 
    *         required: true
    *     responses:
    *       200:
    *         description: OTP resend successfully
    *       404:
    *         description: User not found
    */


    async resendOTP(req, res, next) {
        let validateRequest = Joi.object({
            mobileNumberOREmail: Joi.string().required()
        });
        try {
            const { error, value } = validateRequest.validate(req.query);
            if (error) {
                return next(error);
            }

            let userDetail = await checkUserExists({ $or: [{ email: value.mobileNumberOREmail }, { mobileNumber: value.mobileNumberOREmail }] });

            if (!userDetail) {
                throw apiError.notFound(USER_NOT_FOUND);
            }

            let genrateOTP = commonFunction.getOTP();
            var otpTime = new Date().getTime() + 300000;
            await commonFunction.sendMail(value.email, value.name, otp)
            await userUpdate({ _id: user._id }, { otp: genrateOTP, otpTime: otpTime })

            return res.json(new response({}, responseMessage.OTP_RESEND));


        } catch (error) {
            return next(error);
        }

    },


    /**
    * @swagger
    * /user/forgotPassword:
    *   get:
    *     tags:
    *       - USER
    *     description: Forgot Password
    *     produces:
    *       - application/json
    *     parameters:
    *       - in: query
    *         name: mobileNumberOREmail
    *         type: string
    *         description: mobileNumberOREmail 
    *         required: true
    *     responses:
    *       200:
    *         description: OTP send successfully
    *       404:
    *         description: User not found
    */


    async forgotPassword(req, res, next) {
        let validateRequest = Joi.object({
            mobileNumberOREmail: Joi.string().required()
        });
        try {
            const { error, value } = validateRequest.validate(req.query);
            if (error) {
                return next(error);
            }

            let userDetail = await checkUserExists({ $or: [{ email: value.mobileNumberOREmail }, { mobileNumber: value.mobileNumberOREmail }] });

            if (!userDetail) {
                throw apiError.notFound(USER_NOT_FOUND);
            }

            let genrateOTP = commonFunction.getOTP();
            var otpTime = new Date().getTime() + 300000;
            await commonFunction.sendMail(value.email, value.name, otp)
            await userUpdate({ _id: user._id }, { otp: genrateOTP, otpTime: otpTime })

            return res.json(new response({}, responseMessage.OTP_SEND));
        } catch (error) {
            return next(error);
        }
    },



    /**
   * @swagger
   * /user/resetPassword:
   *   put:
   *     tags:
   *       - USER
   *     description: Reset Password
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: query
   *         name: userId
   *         type: string
   *         description: userId 
   *         required: true
   *       - in: query
   *         name: password
   *         type: string
   *         description: password 
   *         required: true
   *     responses:
   *       200:
   *         description: Password changed successfully
   *       404:
   *         description: User not found
   */

    async resetPassword(req, res, next) {
        let validateRequest = Joi.object({
            userId: Joi.string().required(),
            password: Joi.string().required()
        })

        try {
            const { error, value } = validateRequest.validate(req.query);

            if (error) {
                return next(error);
            }
            let userDetail = await checkUserExists({ _id: value.userId });

            if (!userDetail) {
                throw apiError.notFound(USER_NOT_FOUND)
            }


            await userUpdate({ _id: value.userId }, { password: bcrypt.hashSync(value.password, 10) });

            return res.json(new response({}, responseMessage.PWD_CHANGED));




        } catch (error) {
            return next(error)
        }

    },



    /**
    * @swagger
    * /user/userProfile:
    *   get:
    *     tags:
    *       - USER
    *     description: Profile
    *     produces:
    *       - application/json
    *     parameters:
    *       - name: token
    *         description: token
    *         in: header
    *         required: true
    *     responses:
    *       200:
    *         description: Returns success message
    */

    async userProfile(req, res, next) {
        try {
            let userDetail = await findUser({ _id: req.userId })
            if (!userDetail) {
                throw apiError.notFound(responseMessage.USER_NOT_FOUND);
            }

            return res.json(new response(userDetail, responseMessage.USER_PROFILE_FOUND));

        } catch (error) {
            return next(error);
        }
    },



    /**
   * @swagger
   * /user/changePassword:
   *   put:
   *     tags:
   *       - USER
   *     description: Change Password
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: token
   *         description: token
   *         in: header
   *         required: true
   *       - name: password
   *         description: password
   *         in: query
   *         required: true
   *     responses:
   *       200:
   *         description: Returns success message
   */

    async changePassword(req, res, next) {

        let validateRequest = Joi.object({
            password: Joi.string().required()
        })
        try {
            const { error, value } = validateRequest.validate(req.query)
            if (error) {
                return next(error);
            }


            let userDetail = await findUser({ _id: req.userId });
            if (!userDetail) {
                throw apiError.notFound(responseMessage.USER_NOT_FOUND);
            }

            await userUpdate({ _id: req.userId }, { password: bcrypt.hashSync(value.password, 10) });

            return res.json(new response({}, responseMessage.PWD_CHANGED));

        } catch (error) {
            return next(error);
        }
    },



    /**
     * @swagger
     * /user/updateProfile:
     *   post:
     *     tags:
     *       - USER
     *     description: Profile update
     *     consumes:
     *       - multipart/form-data
     *     produces:
     *       - application/json
     *     parameters:
     *       - in: header
     *         name: token
     *         type: string
     *         required: true
     *         description: token
     *       - in: formData
     *         name: name
     *         type: string
     *         required: true
     *         description: name
     *       - in: formData
     *         name: dob
     *         type: string
     *         required: true
     *         description: dob
     *       - in: formData
     *         name: address
     *         type: string
     *         required: true
     *         description: address
     *       - in: formData
     *         name: mobileNumber
     *         type: string
     *         required: true
     *         description: mobileNumber
     *       - in: formData
     *         name: gender
     *         type: string
     *         required: true
     *         description: gender
     *       - in: formData
     *         name: countryCode
     *         type: string
     *         required: true
     *         description: countryCode
     *       - in: formData
     *         name: profile
     *         type: file
     *         required: true
     *         description: profile
     *     responses:
     *       200:
     *         description: Successful signup
     *       404:
     *         description: User not found
     */

    async updateProfile(req, res, next) {
        let validateRequest = Joi.object({
            name: Joi.string().required(),
            dob: Joi.date().required(),
            address: Joi.string().required(),
            mobileNumber: Joi.string().required(),
            gender: Joi.string().required(),
            countryCode: Joi.string().required(),
        })

        try {
            const { error, value } = validateRequest.validate(req.body);

            if (error) {
                return next(error);
            }

            let userDetails = await findUser({ _id: req.userId });
            if (!userDetails) {
                throw apiError.notFound(responseMessage.USER_NOT_FOUND);
            }

            let imageUrlResult;

            if (req.files.length != 0) {
                for (const image of req.files) {

                    let imageResult = await commonFunction.uploadFile(
                        image.path,
                        image.originalname
                    );
                    imageUrlResult = imageResult;

                    await commonFunction.removeFile(image.path)
                }
            }

            userDetails.profilePic = imageUrlResult;
            userDetails.name = value.name;
            userDetails.dob = value.dob;
            userDetails.address = value.address;
            userDetails.mobileNumber = value.mobileNumber;
            userDetails.gender = value.gender;
            userDetails.countryCode = value.countryCode;

            await userDetails.save();


            return res.json(new response(userDetails, responseMessage.UPDATE_USER_PROFILE))

        } catch (error) {
            return next(error);
        }

    },



    /**
   * @swagger
   * /user/deleteAccount:
   *   delete:
   *     tags:
   *       - USER
   *     description: Delete Account
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: token
   *         description: token
   *         in: header
   *         required: true
   *     responses:
   *       200:
   *         description: Returns success message
   */

    async deleteAccount(req, res, next) {
        try {
            let userDetail = await findUser({ _id: req.userId });
            if (!userDetail) {
                throw apiError.notFound(responseMessage.USER_NOT_FOUND);
            }

            await userUpdate({ _id: req.userId }, { status: status.DELETE });
            return res.json(new response({}, responseMessage.ACCOUNT_DELETE));

        } catch (error) {
            return next(error);
        }

    },





}
