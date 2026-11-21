FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY OpsAtlas.LabService.csproj ./
RUN dotnet restore
COPY . ./
RUN dotnet publish OpsAtlas.LabService.csproj --configuration Release --no-restore --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
COPY --from=build /app/publish ./
USER 10001
ENTRYPOINT ["dotnet", "OpsAtlas.LabService.dll"]
