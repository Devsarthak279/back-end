import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiErrors.js"
import {User} from "../models/user.models.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        const refreshToken = user.generateRefreshToken()
        const accessToken = user.generateAccessToken()
        user.refresToken = refresToken
        await user.save({validateBeforSave:false})
        return {accessToken,refresToken}

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating the access and refresh token")
    }

}

const registerUser = asyncHandler(async (req,res) => {
    // res.status(200).json({
    //     message:"OK"
    // })
    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res

    const {username,fullname,password,email} = req.body
    // console.log("email:", email)

    // if (fullname === "") {
    //     throw new ApiError(400, "fullname is required")
    // }

    // const trimmedEmail = email?.trim();
    // const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    // if (!emailRegex.test(trimmedEmail)) {
    //     return next(new ApiError(400, "Invalid email format. Example: example@gmail.com"));
    // }
    if (
        [fullname,username,password,email].some((field)=>
        field?.trim()==="")
    ) {
        throw new ApiError(400, "all fields are required")
    }

    const existingUser = await User.findOne({
        $or: [{username}, {email}]
    })
    if (existingUser) {
        throw new ApiError(409, "User with this email or username already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }
    
    if (!avatarLocalPath) {
        throw new ApiError(400,"avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if (!avatar) {
        throw new ApiError(400,"avatar file is required")
    }

    const user  = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refresToken"
    )
    if (!createdUser) {
        throw new ApiError(500,"Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200,createdUser,"user registered Successfully")
    )
})

const loginUser = asyncHandler(async (req,res) => {

    const {username,email,password} = req.body

    if(!username || !email){
        throw new ApiError(400, "username or email is required ")
    }

    const user = await User.findOne({
        $or:[{username},{email}]
    })

    if(!user){
        throw new ApiError(404, "user is not registered")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user password")
    }

    const {accessToken,refresToken} = generateAccessAndRefreshToken(user._id)

    const loggedInUser = User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .cookie("refreshToken", refresToken, options)
    .cookie("accessToken", accessToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser,refresToken,accessToken
            },
            "User LoggedIn successfully"
        )
    )

})

const logOutUser = asyncHandler(async (req,res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1 // this removes the field from document
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }
   
    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"))
})

export { 
    registerUser,
    loginUser,
    logOutUser
 }